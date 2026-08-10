"""Pure helpers shared by the dashboard API Lambda entrypoints."""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Protocol


# Keep this import-free list in sync with glue/transforms.py AGGREGATE_NAMES.
AGGREGATE_NAMES: tuple[str, ...] = (
    "dau_wau",
    "retention_cohorts",
    "meal_volume",
    "macro_distributions",
    "top_foods",
    "ai_latency",
    "ai_failure_rate",
    "token_cost_daily",
    "match_rate",
    "onboarding_funnel",
    "coverage_gaps",
    "implausible_foods",
)

INSIGHT_METRICS: tuple[str, ...] = (
    "dau_wau",
    "meal_volume",
    "ai_latency",
    "ai_failure_rate",
    "token_cost_daily",
    "match_rate",
    "coverage_gaps",
)

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
SAFE_RUN_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")
SAFE_QUERY_ID = re.compile(r"[A-Za-z0-9-]{1,128}")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}


class DynamoTable(Protocol):
    def query(self, **kwargs: Any) -> Mapping[str, Any]: ...

    def get_item(self, **kwargs: Any) -> Mapping[str, Any]: ...


class ApiError(ValueError):
    """A clean client-facing error with an HTTP status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def json_compatible(value: Any) -> Any:
    """Convert AWS response values to values accepted by ``json.dumps``."""

    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): json_compatible(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_compatible(item) for item in value]
    return value


def json_response(status_code: int, body: Any) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": dict(CORS_HEADERS),
        "body": json.dumps(
            json_compatible(body),
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ),
    }


def error_response(error: Exception) -> dict[str, Any]:
    if isinstance(error, ApiError):
        return json_response(error.status_code, {"error": str(error)})
    return json_response(500, {"error": "Internal server error"})


def request_method(event: Mapping[str, Any]) -> str:
    method = event.get("httpMethod")
    if isinstance(method, str):
        return method.upper()
    request_context = event.get("requestContext")
    if isinstance(request_context, Mapping):
        http = request_context.get("http")
        if isinstance(http, Mapping) and isinstance(http.get("method"), str):
            return http["method"].upper()
    return ""


def path_parameter(event: Mapping[str, Any], *names: str) -> str | None:
    parameters = event.get("pathParameters")
    if not isinstance(parameters, Mapping):
        return None
    for name in names:
        value = parameters.get(name)
        if isinstance(value, str) and value:
            return value
    return None


def query_parameters(event: Mapping[str, Any]) -> Mapping[str, Any]:
    parameters = event.get("queryStringParameters")
    return parameters if isinstance(parameters, Mapping) else {}


def parse_json_body(event: Mapping[str, Any]) -> Mapping[str, Any]:
    body = event.get("body")
    if not isinstance(body, str) or not body.strip():
        raise ApiError("request body must be a JSON object")
    if event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as error:
            raise ApiError("request body is not valid base64 UTF-8") from error
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as error:
        raise ApiError("request body must be valid JSON") from error
    if not isinstance(parsed, Mapping):
        raise ApiError("request body must be a JSON object")
    return parsed


def validate_iso_date(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or ISO_DATE.fullmatch(value) is None:
        raise ApiError(f"{field_name} must be an ISO date in YYYY-MM-DD format")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ApiError(f"{field_name} must be a valid calendar date") from error
    if parsed.isoformat() != value:
        raise ApiError(f"{field_name} must be an ISO date in YYYY-MM-DD format")
    return value


def validate_date_range(from_value: Any, to_value: Any) -> tuple[str, str]:
    from_date = validate_iso_date(from_value, "from")
    to_date = validate_iso_date(to_value, "to")
    if from_date > to_date:
        raise ApiError("from must be on or before to")
    return from_date, to_date


def validate_metric(metric: Any) -> str:
    if not isinstance(metric, str) or metric not in AGGREGATE_NAMES:
        raise ApiError("metric is not a supported aggregate")
    return metric


def validate_run_id(run_id: Any) -> str:
    if not isinstance(run_id, str) or SAFE_RUN_ID.fullmatch(run_id) is None:
        raise ApiError("run_id is invalid")
    return run_id


def validate_query_id(query_id: Any) -> str:
    if not isinstance(query_id, str) or SAFE_QUERY_ID.fullmatch(query_id) is None:
        raise ApiError("query execution id is invalid")
    return query_id


def normalize_dynamo_item(item: Mapping[str, Any]) -> dict[str, Any]:
    normalized = json_compatible(item)
    payload = normalized.get("payload")
    if isinstance(payload, str):
        try:
            normalized["payload"] = json.loads(payload)
        except json.JSONDecodeError:
            # Historical records may contain a plain string payload. Preserve it.
            pass
    return normalized


def query_metric_range(
    table: DynamoTable, metric: str, from_date: str, to_date: str
) -> list[dict[str, Any]]:
    """Query one metric/date partition, following DynamoDB pagination."""

    arguments: dict[str, Any] = {
        "KeyConditionExpression": (
            "#metric = :metric AND #date BETWEEN :from_date AND :to_date"
        ),
        "ExpressionAttributeNames": {"#metric": "metric", "#date": "date"},
        "ExpressionAttributeValues": {
            ":metric": metric,
            ":from_date": from_date,
            ":to_date": to_date,
        },
        "ScanIndexForward": True,
    }
    items: list[dict[str, Any]] = []
    while True:
        response = table.query(**arguments)
        for item in response.get("Items", []):
            if isinstance(item, Mapping):
                items.append(normalize_dynamo_item(item))
        last_key = response.get("LastEvaluatedKey")
        if not isinstance(last_key, Mapping) or not last_key:
            return items
        arguments["ExclusiveStartKey"] = dict(last_key)


def get_run_record(table: DynamoTable, run_id: str) -> dict[str, Any] | None:
    response = table.get_item(
        Key={"metric": f"_run#{run_id}", "date": "latest"},
        ConsistentRead=False,
    )
    item = response.get("Item")
    return normalize_dynamo_item(item) if isinstance(item, Mapping) else None


def build_insight_context(
    items_by_metric: Mapping[str, Sequence[Mapping[str, Any]]],
    from_date: str,
    to_date: str,
) -> dict[str, Any]:
    """Build a deterministic, compact Gemini context from aggregate records."""

    metrics: dict[str, list[dict[str, Any]]] = {}
    for metric in INSIGHT_METRICS:
        records: list[dict[str, Any]] = []
        for item in items_by_metric.get(metric, ()):
            normalized = normalize_dynamo_item(item)
            record: dict[str, Any] = {"date": normalized.get("date")}
            record["data"] = normalized.get("payload")
            records.append(record)
        metrics[metric] = records
    return {"period": {"from": from_date, "to": to_date}, "metrics": metrics}


def compact_json(value: Any) -> str:
    return json.dumps(
        json_compatible(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )

