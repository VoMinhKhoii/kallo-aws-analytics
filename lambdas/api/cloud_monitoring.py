"""GET /cloud-monitoring: cached Cloud Run operations from Google Monitoring."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
from collections.abc import Callable, Mapping
from datetime import date, datetime, timedelta, timezone
from typing import Any

try:
    from api_core import ApiError, error_response, json_response, query_parameters, request_method, validate_date_range
except ImportError:
    from .api_core import ApiError, error_response, json_response, query_parameters, request_method, validate_date_range


CACHE_METRIC = "_external#cloud_run_system"
CACHE_SECONDS = 120
SAFE_RESOURCE = re.compile(r"[A-Za-z0-9._-]{1,128}")
MONITORING_URL = "https://monitoring.googleapis.com/v3/projects/{project}/timeSeries"
Fetcher = Callable[[str, str, str | None, list[str]], Mapping[str, Any]]


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _point_value(point: Mapping[str, Any]) -> float:
    value = point.get("value")
    if not isinstance(value, Mapping):
        return 0.0
    for key in ("doubleValue", "int64Value"):
        if key in value:
            return _number(value[key])
    return 0.0


def _points(response: Mapping[str, Any]) -> list[tuple[str, float, Mapping[str, Any]]]:
    output: list[tuple[str, float, Mapping[str, Any]]] = []
    for series in response.get("timeSeries", []):
        if not isinstance(series, Mapping):
            continue
        labels = series.get("metric")
        metric_labels = labels.get("labels", {}) if isinstance(labels, Mapping) else {}
        for point in series.get("points", []):
            if not isinstance(point, Mapping):
                continue
            interval = point.get("interval")
            timestamp = interval.get("endTime") if isinstance(interval, Mapping) else None
            if isinstance(timestamp, str):
                output.append((timestamp, _point_value(point), metric_labels))
    return output


def _alignment_seconds(from_date: str, to_date: str) -> int:
    days = (date.fromisoformat(to_date) - date.fromisoformat(from_date)).days + 1
    return 3600 if days <= 7 else 21600 if days <= 30 else 86400


def collect_cloud_run_metrics(
    *, project: str, service: str, location: str, from_date: str, to_date: str,
    fetch: Fetcher, collected_at: str,
) -> dict[str, Any]:
    alignment = _alignment_seconds(from_date, to_date)
    rows: dict[str, dict[str, Any]] = {}

    def merge(field: str, response: Mapping[str, Any]) -> None:
        for timestamp, value, _labels in _points(response):
            rows.setdefault(timestamp, {"timestamp": timestamp})[field] = value

    for percentile in (50, 95, 99):
        merge(
            f"p{percentile}_ms",
            fetch("run.googleapis.com/request_latencies", f"ALIGN_PERCENTILE_{percentile}", f"REDUCE_PERCENTILE_{percentile}", []),
        )

    count_response = fetch(
        "run.googleapis.com/request_count", "ALIGN_SUM", "REDUCE_SUM",
        ["metric.labels.response_code_class"],
    )
    for timestamp, value, labels in _points(count_response):
        row = rows.setdefault(timestamp, {"timestamp": timestamp})
        row["request_count"] = row.get("request_count", 0) + value
        if str(labels.get("response_code_class", "")).startswith("5"):
            row["error_count"] = row.get("error_count", 0) + value

    for field, metric, aligner, reducer in (
        ("startup_p95_ms", "run.googleapis.com/container/startup_latencies", "ALIGN_PERCENTILE_95", "REDUCE_PERCENTILE_95"),
        ("cpu_p95", "run.googleapis.com/container/cpu/utilizations", "ALIGN_PERCENTILE_95", "REDUCE_PERCENTILE_95"),
        ("memory_p95", "run.googleapis.com/container/memory/utilizations", "ALIGN_PERCENTILE_95", "REDUCE_PERCENTILE_95"),
        # Instance count is split into active and idle time series. Average each
        # state inside the display bucket before summing the states/revisions;
        # taking each state's maximum first can add peaks from different
        # minutes and report a total that never actually existed.
        ("instances", "run.googleapis.com/container/instance_count", "ALIGN_MEAN", "REDUCE_SUM"),
    ):
        merge(field, fetch(metric, aligner, reducer, []))

    series = []
    for timestamp in sorted(rows):
        row = rows[timestamp]
        requests = _number(row.get("request_count"))
        errors = _number(row.get("error_count"))
        row["request_count"] = int(requests)
        row["error_count"] = int(errors)
        row["error_rate"] = round(errors / requests, 6) if requests else 0.0
        series.append(row)
    return {
        "source": "google-cloud-monitoring",
        "project": project,
        "service": service,
        "location": location,
        "from": from_date,
        "to": to_date,
        "alignment_seconds": alignment,
        "collected_at": collected_at,
        "series": series,
    }


def monitoring_fetcher(
    *, token: str, project: str, service: str, location: str,
    from_date: str, to_date: str,
) -> Fetcher:
    alignment = _alignment_seconds(from_date, to_date)
    end = date.fromisoformat(to_date) + timedelta(days=1)
    resource_filter = (
        f'resource.type = "cloud_run_revision" AND '
        f'resource.labels.service_name = "{service}" AND '
        f'resource.labels.location = "{location}"'
    )

    def fetch(metric: str, aligner: str, reducer: str | None, group_by: list[str]) -> Mapping[str, Any]:
        params: list[tuple[str, str]] = [
            ("filter", f'metric.type = "{metric}" AND {resource_filter}'),
            ("interval.startTime", f"{from_date}T00:00:00Z"),
            ("interval.endTime", f"{end.isoformat()}T00:00:00Z"),
            ("view", "FULL"),
            ("aggregation.alignmentPeriod", f"{alignment}s"),
            ("aggregation.perSeriesAligner", aligner),
        ]
        if reducer:
            params.append(("aggregation.crossSeriesReducer", reducer))
        params.extend(("aggregation.groupByFields", field) for field in group_by)
        import requests

        response = requests.get(
            MONITORING_URL.format(project=urllib.parse.quote(project, safe="")),
            params=params,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=12,
        )
        response.raise_for_status()
        return response.json()

    return fetch


def handle(
    event: Mapping[str, Any], table: Any, *, fetch_factory: Callable[..., Fetcher],
    project: str, service: str, location: str, now: Callable[[], float] = time.time,
) -> dict[str, Any]:
    try:
        if request_method(event) != "GET":
            raise ApiError("method not allowed", 405)
        if not all(SAFE_RESOURCE.fullmatch(value or "") for value in (project, service, location)):
            raise RuntimeError("Cloud Monitoring resource configuration is invalid")
        parameters = query_parameters(event)
        from_date, to_date = validate_date_range(parameters.get("from"), parameters.get("to"))
        refresh = str(parameters.get("refresh", "")).lower() in {"1", "true"}
        cache_key = f"{from_date}#{to_date}"
        if not refresh:
            cached = table.get_item(Key={"metric": CACHE_METRIC, "date": cache_key}).get("Item")
            if isinstance(cached, Mapping) and _number(cached.get("expires_at")) > now():
                return json_response(200, json.loads(str(cached["payload_json"])))

        collected_at = datetime.fromtimestamp(now(), timezone.utc).isoformat().replace("+00:00", "Z")
        payload = collect_cloud_run_metrics(
            project=project, service=service, location=location,
            from_date=from_date, to_date=to_date,
            fetch=fetch_factory(from_date=from_date, to_date=to_date),
            collected_at=collected_at,
        )
        table.put_item(Item={
            "metric": CACHE_METRIC,
            "date": cache_key,
            "expires_at": int(now()) + CACHE_SECONDS,
            "payload_json": json.dumps(payload, separators=(",", ":"), allow_nan=False),
        })
        return json_response(200, payload)
    except Exception as error:
        return error_response(error)


def _access_token(secret: Mapping[str, Any]) -> str:
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        dict(secret), scopes=["https://www.googleapis.com/auth/monitoring.read"]
    )
    credentials.refresh(Request())
    if not credentials.token:
        raise RuntimeError("Google credentials did not return an access token")
    return credentials.token


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    import boto3

    table_name = os.environ.get("TABLE_NAME", "")
    secret_arn = os.environ.get("GCP_SERVICE_ACCOUNT_SECRET_ARN", "")
    project = os.environ.get("GCP_PROJECT_ID", "")
    service = os.environ.get("GCP_CLOUD_RUN_SERVICE", "")
    location = os.environ.get("GCP_CLOUD_RUN_LOCATION", "")
    if not table_name or not secret_arn:
        return error_response(RuntimeError("Cloud Monitoring Lambda is not configured"))
    token: str | None = None

    def fetch_factory(**window: str) -> Fetcher:
        nonlocal token
        if token is None:
            secret_value = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn)["SecretString"]
            token = _access_token(json.loads(secret_value))
        return monitoring_fetcher(
            token=token, project=project, service=service, location=location, **window
        )

    return handle(
        event or {}, boto3.resource("dynamodb").Table(table_name),
        project=project, service=service, location=location,
        fetch_factory=fetch_factory,
    )
