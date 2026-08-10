"""POST /insight/weekly Gemini summary Lambda entrypoint."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

import urllib3

try:
    from api_core import (
        ApiError,
        INSIGHT_METRICS,
        build_insight_context,
        compact_json,
        error_response,
        json_response,
        query_metric_range,
        request_method,
    )
except ImportError:
    from .api_core import (
        ApiError,
        INSIGHT_METRICS,
        build_insight_context,
        compact_json,
        error_response,
        json_response,
        query_metric_range,
        request_method,
    )


GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
GEMINI_FAILURE_MESSAGE = "Weekly summary is temporarily unavailable"

_gemini_api_key: str | None = None


class GeminiError(RuntimeError):
    """The remote summary call failed or returned an invalid response."""


def load_gemini_api_key(secrets_client: Any, secret_arn: str) -> str:
    response = secrets_client.get_secret_value(SecretId=secret_arn)
    secret = response.get("SecretString")
    if not isinstance(secret, str) or not secret:
        raise RuntimeError("Gemini secret has no SecretString")
    try:
        parsed = json.loads(secret)
    except json.JSONDecodeError:
        return secret
    if isinstance(parsed, Mapping):
        key = parsed.get("api_key") or parsed.get("key")
        if isinstance(key, str) and key:
            return key
    raise RuntimeError("Gemini secret must be a key string or JSON object with api_key")


def gemini_prompt(context: Mapping[str, Any]) -> str:
    return (
        "You are the operations analyst for Kallo, a calorie-tracking app. "
        "Using only the aggregate JSON below, write a short weekly operations "
        "summary in English. Use at most 120 words. Highlight material changes, "
        "latency or failure concerns, cost, match quality, and coverage gaps when "
        "the data supports them. Do not invent causes or numbers. If data is "
        "missing, say so briefly.\n\nAggregate JSON:\n"
        + compact_json(context)
    )


def call_gemini(
    http_client: Any,
    api_key: str,
    context: Mapping[str, Any],
    *,
    timeout_seconds: float = 25.0,
) -> str:
    body = {
        "contents": [{"role": "user", "parts": [{"text": gemini_prompt(context)}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 300},
    }
    try:
        response = http_client.request(
            "POST",
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            body=compact_json(body).encode("utf-8"),
            timeout=urllib3.Timeout(total=min(25.0, timeout_seconds)),
            retries=False,
        )
    except Exception as error:
        raise GeminiError("Gemini request failed") from error
    if not 200 <= int(getattr(response, "status", 0)) < 300:
        raise GeminiError("Gemini returned a non-success response")
    try:
        payload = json.loads(response.data.decode("utf-8"))
        summary = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (AttributeError, IndexError, KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GeminiError("Gemini returned an invalid response") from error
    if not isinstance(summary, str) or not summary.strip():
        raise GeminiError("Gemini returned an empty summary")
    return summary.strip()


def handle(
    event: Mapping[str, Any],
    *,
    table: Any,
    secrets_client: Any,
    http_client: Any,
    secret_arn: str,
    context: Any = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    global _gemini_api_key

    try:
        if request_method(event) != "POST":
            raise ApiError("method not allowed", 405)
        today = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).date()
        from_date = (today - timedelta(days=6)).isoformat()
        to_date = today.isoformat()
        items_by_metric = {
            metric: query_metric_range(table, metric, from_date, to_date)
            for metric in INSIGHT_METRICS
        }
        insight_context = build_insight_context(items_by_metric, from_date, to_date)
        if _gemini_api_key is None:
            _gemini_api_key = load_gemini_api_key(secrets_client, secret_arn)
        timeout_seconds = 25.0
        if context is not None and hasattr(context, "get_remaining_time_in_millis"):
            remaining = context.get_remaining_time_in_millis() / 1000.0
            timeout_seconds = max(0.1, min(25.0, remaining - 1.0))
        summary = call_gemini(
            http_client,
            _gemini_api_key,
            insight_context,
            timeout_seconds=timeout_seconds,
        )
        return json_response(200, {"summary": summary})
    except GeminiError:
        return json_response(502, {"error": GEMINI_FAILURE_MESSAGE})
    except Exception as error:
        return error_response(error)


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    import boto3

    table_name = os.environ.get("TABLE_NAME")
    secret_arn = os.environ.get("GEMINI_SECRET_ARN")
    if not table_name or not secret_arn:
        return error_response(RuntimeError("insight environment is incomplete"))
    return handle(
        event or {},
        table=boto3.resource("dynamodb").Table(table_name),
        secrets_client=boto3.client("secretsmanager"),
        http_client=urllib3.PoolManager(),
        secret_arn=secret_arn,
        context=context,
    )

