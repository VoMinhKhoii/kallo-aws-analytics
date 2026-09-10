from __future__ import annotations

from datetime import datetime, timezone

from lambdas.api import cloud_logging


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, *, Item):
        self.items[(Item["metric"], Item["date"])] = Item

    def query(self, **arguments):
        values = arguments["ExpressionAttributeValues"]
        metric = values[":metric"]
        start = values[":start"]
        end = values[":end"]
        return {
            "Items": [
                item for (item_metric, date), item in sorted(self.items.items())
                if item_metric == metric and start <= date <= end
            ]
        }


def entry(timestamp, latency, url, method="GET"):
    return {
        "timestamp": timestamp,
        "httpRequest": {
            "latency": latency,
            "requestUrl": url,
            "requestMethod": method,
        },
    }


def test_ingests_all_request_endpoints_into_idempotent_hourly_histograms():
    table = FakeTable()
    pages = [
        {
            "entries": [
                entry("2026-09-10T05:10:00Z", "12.5s", "https://kallo.fit/api/analyze-meal", "POST"),
                entry("2026-09-10T05:12:00Z", "0.080s", "https://kallo.fit/api/v1/groups"),
                entry("2026-09-10T05:13:00Z", "0.300s", "https://kallo.fit/en"),
            ],
            "nextPageToken": "next",
        },
        {
            "entries": [
                entry("2026-09-10T06:01:00Z", "1.2s", "https://kallo.fit/_next/image?x=1"),
            ]
        },
    ]
    calls = []

    def fetch(start, end, token):
        calls.append((start, end, token))
        return pages[1] if token else pages[0]

    arguments = {
        "table": table,
        "fetch": fetch,
        "start": datetime(2026, 9, 10, 5, tzinfo=timezone.utc),
        "end": datetime(2026, 9, 10, 7, tzinfo=timezone.utc),
        "ingested_at": datetime(2026, 9, 10, 7, 5, tzinfo=timezone.utc),
    }
    first = cloud_logging.ingest_route_logs(**arguments)
    second = cloud_logging.ingest_route_logs(**arguments)

    assert first == second == {
        "status": "ingested",
        "from": "2026-09-10T05:00:00Z",
        "to": "2026-09-10T07:00:00Z",
        "requests": 4,
        "hourly_buckets": 3,
        "pages": 2,
    }
    assert len(table.items) == 3
    assert len(calls) == 4
    ai = table.items[(f"{cloud_logging.ROUTE_METRIC_PREFIX}ai", "2026-09-10T05:00:00Z")]
    normal = table.items[(f"{cloud_logging.ROUTE_METRIC_PREFIX}normal", "2026-09-10T05:00:00Z")]
    assert ai["count"] == 1
    assert ai["sum_ms"] == 12_500
    assert normal["count"] == 2
    assert normal["min_ms"] == 80
    assert normal["max_ms"] == 300
    assert not any(isinstance(value, float) for item in table.items.values() for value in item.values())


def test_merges_hourly_histograms_into_display_percentiles():
    table = FakeTable()
    values = {
        "ai": [("2026-09-10T05:00:00Z", [5_000, 10_000, 15_000])],
        "normal": [
            ("2026-09-10T05:00:00Z", [10, 20, 30]),
            ("2026-09-10T06:00:00Z", [40, 50, 60]),
        ],
    }
    ingested_at = datetime(2026, 9, 10, 7, tzinfo=timezone.utc)
    for route, hours in values.items():
        for hour, samples in hours:
            table.put_item(Item=cloud_logging._histogram_item(route, cloud_logging._utc(hour), samples, ingested_at))

    rows = cloud_logging.stored_route_series(
        table=table,
        from_date="2026-09-10",
        to_date="2026-09-10",
        alignment_seconds=21_600,
    )

    assert [row["timestamp"] for row in rows] == [
        "2026-09-10T06:00:00Z",
        "2026-09-10T12:00:00Z",
    ]
    assert rows[0]["ai_request_count"] == 3
    assert rows[0]["normal_request_count"] == 3
    assert rows[1]["normal_request_count"] == 3
    assert 5_000 <= rows[0]["ai_p50_ms"] <= 15_000
    assert 10 <= rows[0]["normal_p50_ms"] <= 30
    assert 40 <= rows[1]["normal_p95_ms"] <= 60


def test_rejects_invalid_latency_and_entries_without_request_paths():
    assert cloud_logging.latency_ms("80ms") is None
    assert cloud_logging.route_class({"httpRequest": {"requestUrl": ""}}) is None
