from __future__ import annotations

import json

from lambdas.api import cloud_monitoring


def body(response):
    return json.loads(response["body"])


def response(points, labels=None):
    return {
        "timeSeries": [
            {
                "metric": {"labels": labels or {}},
                "points": [
                    {
                        "interval": {"endTime": timestamp},
                        "value": {"doubleValue": value},
                    }
                    for timestamp, value in points
                ],
            }
        ]
    }


class FakeTable:
    def __init__(self):
        self.items = {}
        self.puts = []

    def get_item(self, *, Key):
        item = self.items.get((Key["metric"], Key["date"]))
        return {"Item": item} if item else {}

    def put_item(self, *, Item):
        self.puts.append(Item)
        self.items[(Item["metric"], Item["date"])] = Item


class FakeGoogle:
    def __init__(self):
        self.calls = []

    def factory(self, **window):
        def fetch(metric, aligner, reducer, group_by):
            self.calls.append((metric, aligner, reducer, group_by, window))
            if metric.endswith("request_count"):
                return {
                    "timeSeries": [
                        response([("2026-09-08T01:00:00Z", 8)], {"response_code_class": "2xx"})["timeSeries"][0],
                        response([("2026-09-08T01:00:00Z", 2)], {"response_code_class": "5xx"})["timeSeries"][0],
                    ]
                }
            values = {
                "ALIGN_PERCENTILE_50": 120,
                "ALIGN_PERCENTILE_95": 420,
                "ALIGN_PERCENTILE_99": 900,
                "ALIGN_MEAN": 0.88,
            }
            value = values[aligner]
            if metric.startswith("logging.googleapis.com/"):
                value /= 1000
            return response([("2026-09-08T01:00:00Z", value)])

        return fetch


def event(refresh=False):
    return {
        "httpMethod": "GET",
        "queryStringParameters": {
            "from": "2026-09-01",
            "to": "2026-09-08",
            "refresh": "1" if refresh else "0",
        },
    }


def test_collects_request_latency_separately_from_ai_and_caches_result():
    table = FakeTable()
    google = FakeGoogle()
    result = cloud_monitoring.handle(
        event(), table,
        fetch_factory=google.factory,
        project="kallo-project",
        service="kallo-api",
        location="asia-southeast1",
        now=lambda: 1_000,
    )

    assert result["statusCode"] == 200
    payload = body(result)
    assert payload["source"] == "google-cloud-monitoring"
    assert payload["series"] == [
        {
            "timestamp": "2026-09-08T01:00:00Z",
            "p50_ms": 120,
            "p95_ms": 420,
            "p99_ms": 900,
            "ai_p50_ms": 120,
            "ai_p95_ms": 420,
            "ai_p99_ms": 900,
            "normal_p50_ms": 120,
            "normal_p95_ms": 420,
            "normal_p99_ms": 900,
            "request_count": 10,
            "error_count": 2,
            "error_rate": 0.2,
            "startup_p95_ms": 420,
            "cpu_p95": 420,
            "memory_p95": 420,
            "instances": 0.88,
        }
    ]
    assert len(google.calls) == 14
    assert all(
        call[0].startswith(("run.googleapis.com/", "logging.googleapis.com/user/"))
        for call in google.calls
    )
    assert (
        "run.googleapis.com/container/instance_count",
        "ALIGN_MEAN",
        "REDUCE_SUM",
        [],
        {"from_date": "2026-09-01", "to_date": "2026-09-08"},
    ) in google.calls
    assert table.puts[0]["metric"] == cloud_monitoring.CACHE_METRIC


def test_cache_hit_skips_google_and_refresh_bypasses_cache():
    table = FakeTable()
    google = FakeGoogle()
    arguments = dict(
        table=table, fetch_factory=google.factory, project="project",
        service="service", location="us-central1", now=lambda: 1_000,
    )
    cloud_monitoring.handle(event(), **arguments)
    first_call_count = len(google.calls)
    cached = cloud_monitoring.handle(event(), **arguments)
    assert cached["statusCode"] == 200
    assert len(google.calls) == first_call_count

    refreshed = cloud_monitoring.handle(event(refresh=True), **arguments)
    assert refreshed["statusCode"] == 200
    assert len(google.calls) == first_call_count * 2


def test_rejects_invalid_resource_configuration_before_google_call():
    google = FakeGoogle()
    result = cloud_monitoring.handle(
        event(), FakeTable(), fetch_factory=google.factory,
        project="bad project", service="service", location="us-central1",
    )
    assert result["statusCode"] == 500
    assert google.calls == []
