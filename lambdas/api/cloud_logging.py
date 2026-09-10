"""Persist bounded Cloud Run request-latency histograms from Cloud Logging."""

from __future__ import annotations

import bisect
import re
import urllib.parse
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any


LOGGING_URL = "https://logging.googleapis.com/v2/entries:list"
ROUTE_METRIC_PREFIX = "_external#cloud_run_route_latency#"
RETENTION_DAYS = 32
MAX_PAGES = 200
HISTOGRAM_BOUNDS_MS = (
    1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1_000, 2_000,
    4_000, 8_000, 16_000, 32_000, 64_000, 128_000,
)
LATENCY = re.compile(r"^([0-9]+(?:\.[0-9]+)?)s$")
LogFetcher = Callable[[str, str, str | None], Mapping[str, Any]]


def _utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _hour_start(value: str) -> datetime:
    parsed = _utc(value)
    return parsed.replace(minute=0, second=0, microsecond=0)


def latency_ms(value: Any) -> float | None:
    match = LATENCY.fullmatch(str(value or ""))
    return float(match.group(1)) * 1_000 if match else None


def route_class(entry: Mapping[str, Any]) -> str | None:
    request = entry.get("httpRequest")
    if not isinstance(request, Mapping):
        return None
    url = str(request.get("requestUrl") or "")
    path = urllib.parse.urlparse(url).path
    if not path:
        return None
    method = str(request.get("requestMethod") or "").upper()
    return "ai" if method == "POST" and path == "/api/analyze-meal" else "normal"


def logging_fetcher(
    *, token: str, project: str, service: str, location: str,
) -> LogFetcher:
    resource_names = [f"projects/{project}"]
    base_filter = (
        'resource.type="cloud_run_revision" AND '
        f'resource.labels.service_name="{service}" AND '
        f'resource.labels.location="{location}" AND '
        'log_id("run.googleapis.com/requests")'
    )

    def fetch(start: str, end: str, page_token: str | None) -> Mapping[str, Any]:
        import requests

        body: dict[str, Any] = {
            "resourceNames": resource_names,
            "filter": f'{base_filter} AND timestamp>="{start}" AND timestamp<"{end}"',
            "orderBy": "timestamp asc",
            "pageSize": 1_000,
        }
        if page_token:
            body["pageToken"] = page_token
        response = requests.post(
            LOGGING_URL,
            json=body,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    return fetch


def _histogram_item(
    route: str, hour: datetime, values: list[float], ingested_at: datetime,
) -> dict[str, Any]:
    counts = [0] * (len(HISTOGRAM_BOUNDS_MS) + 1)
    for value in values:
        counts[bisect.bisect_right(HISTOGRAM_BOUNDS_MS, value)] += 1
    return {
        "metric": f"{ROUTE_METRIC_PREFIX}{route}",
        "date": _iso(hour),
        "count": len(values),
        "sum_ms": Decimal(str(sum(values))),
        "min_ms": Decimal(str(min(values))),
        "max_ms": Decimal(str(max(values))),
        "bucket_counts": counts,
        "ingested_at": _iso(ingested_at),
        "expires_at": int((hour + timedelta(days=RETENTION_DAYS)).timestamp()),
    }


def ingest_route_logs(
    *, table: Any, fetch: LogFetcher, start: datetime, end: datetime,
    ingested_at: datetime,
) -> dict[str, Any]:
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise ValueError("ingestion window must be an ordered timezone-aware interval")
    grouped: dict[tuple[str, datetime], list[float]] = {}
    page_token: str | None = None
    seen = 0
    pages = 0
    while True:
        pages += 1
        if pages > MAX_PAGES:
            raise RuntimeError("Cloud Logging pagination limit exceeded")
        response = fetch(_iso(start), _iso(end), page_token)
        for entry in response.get("entries", []):
            if not isinstance(entry, Mapping):
                continue
            route = route_class(entry)
            request = entry.get("httpRequest")
            value = latency_ms(request.get("latency")) if isinstance(request, Mapping) else None
            timestamp = entry.get("timestamp") or entry.get("receiveTimestamp")
            if route and value is not None and isinstance(timestamp, str):
                grouped.setdefault((route, _hour_start(timestamp)), []).append(value)
                seen += 1
        token = response.get("nextPageToken")
        page_token = token if isinstance(token, str) and token else None
        if not page_token:
            break

    for (route, hour), values in grouped.items():
        table.put_item(Item=_histogram_item(route, hour, values, ingested_at))
    return {
        "status": "ingested",
        "from": _iso(start),
        "to": _iso(end),
        "requests": seen,
        "hourly_buckets": len(grouped),
        "pages": pages,
    }


def _query_items(table: Any, route: str, start: str, end: str) -> list[Mapping[str, Any]]:
    items: list[Mapping[str, Any]] = []
    exclusive_start_key = None
    while True:
        arguments: dict[str, Any] = {
            "KeyConditionExpression": "metric = :metric AND #date BETWEEN :start AND :end",
            "ExpressionAttributeNames": {"#date": "date"},
            "ExpressionAttributeValues": {
                ":metric": f"{ROUTE_METRIC_PREFIX}{route}",
                ":start": start,
                ":end": end,
            },
        }
        if exclusive_start_key:
            arguments["ExclusiveStartKey"] = exclusive_start_key
        response = table.query(**arguments)
        items.extend(item for item in response.get("Items", []) if isinstance(item, Mapping))
        exclusive_start_key = response.get("LastEvaluatedKey")
        if not exclusive_start_key:
            return items


def _merge(items: list[Mapping[str, Any]]) -> dict[str, Any]:
    counts = [0] * (len(HISTOGRAM_BOUNDS_MS) + 1)
    total = 0
    summed = 0.0
    minimum = None
    maximum = None
    for item in items:
        item_counts = [int(value) for value in item.get("bucket_counts", [])]
        if len(item_counts) != len(counts):
            continue
        counts = [left + right for left, right in zip(counts, item_counts, strict=True)]
        total += int(item.get("count", 0))
        summed += float(item.get("sum_ms", 0))
        item_min = float(item.get("min_ms", 0))
        item_max = float(item.get("max_ms", 0))
        minimum = item_min if minimum is None else min(minimum, item_min)
        maximum = item_max if maximum is None else max(maximum, item_max)
    return {"counts": counts, "count": total, "sum": summed, "min": minimum, "max": maximum}


def _percentile(histogram: Mapping[str, Any], percentile: int) -> float | None:
    total = int(histogram.get("count", 0))
    if total <= 0:
        return None
    if total == 1:
        return float(histogram["sum"])
    target = total * percentile / 100
    cumulative = 0
    counts = histogram["counts"]
    for index, count in enumerate(counts):
        previous = cumulative
        cumulative += count
        if cumulative >= target and count:
            lower = 0.0 if index == 0 else float(HISTOGRAM_BOUNDS_MS[index - 1])
            upper = (
                float(HISTOGRAM_BOUNDS_MS[index])
                if index < len(HISTOGRAM_BOUNDS_MS)
                else float(histogram["max"])
            )
            fraction = (target - previous) / count
            estimate = lower + max(0.0, min(1.0, fraction)) * (upper - lower)
            return max(float(histogram["min"]), min(float(histogram["max"]), estimate))
    return float(histogram["max"])


def stored_route_series(
    *, table: Any, from_date: str, to_date: str, alignment_seconds: int,
) -> list[dict[str, Any]]:
    start = f"{from_date}T00:00:00Z"
    end_dt = _utc(f"{to_date}T00:00:00Z") + timedelta(days=1)
    end = _iso(end_dt)
    grouped: dict[tuple[str, datetime], list[Mapping[str, Any]]] = {}
    for route in ("ai", "normal"):
        for item in _query_items(table, route, start, end):
            hour = _utc(str(item["date"]))
            epoch = int(hour.timestamp())
            bucket_end = datetime.fromtimestamp(
                (epoch // alignment_seconds + 1) * alignment_seconds,
                timezone.utc,
            )
            grouped.setdefault((route, bucket_end), []).append(item)

    rows: dict[str, dict[str, Any]] = {}
    for (route, bucket_end), items in grouped.items():
        histogram = _merge(items)
        row = rows.setdefault(_iso(bucket_end), {"timestamp": _iso(bucket_end)})
        row[f"{route}_request_count"] = histogram["count"]
        for percentile in (50, 95, 99):
            row[f"{route}_p{percentile}_ms"] = _percentile(histogram, percentile)
    return [rows[key] for key in sorted(rows)]
