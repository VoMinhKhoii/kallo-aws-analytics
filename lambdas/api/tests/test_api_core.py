from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from lambdas.api import athena, insight, metrics, runs
from lambdas.api.api_core import (
    ApiError,
    build_insight_context,
    validate_date_range,
)


class ConditionalCheckFailedException(Exception):
    response = {"Error": {"Code": "ConditionalCheckFailedException"}}


def response_body(response):
    return json.loads(response["body"])


class FakeTable:
    def __init__(self, *, query_items=None, run_item=None, journal=None):
        self.query_items = list(query_items or [])
        self.run_item = run_item
        self.guard_item = None
        self.query_calls = []
        self.get_calls = []
        self.puts = []
        self.journal = journal if journal is not None else []

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        return {"Items": list(self.query_items)}

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        if kwargs.get("Key") == {
            "metric": runs.RUN_GUARD_METRIC,
            "date": runs.RUN_GUARD_DATE,
        }:
            return {"Item": self.guard_item} if self.guard_item is not None else {}
        return {"Item": self.run_item} if self.run_item is not None else {}

    def put_item(self, **kwargs):
        item = kwargs["Item"]
        if item.get("metric") == runs.RUN_GUARD_METRIC:
            now = kwargs.get("ExpressionAttributeValues", {}).get(":now")
            if self.guard_item is not None and self.guard_item.get("guard_until", 0) > now:
                raise ConditionalCheckFailedException()
            self.guard_item = dict(item)
            self.journal.append("claim")
            return {}
        self.puts.append(item)
        self.journal.append("put_item")
        return {}

    def update_item(self, **kwargs):
        if kwargs.get("Key") != {
            "metric": runs.RUN_GUARD_METRIC,
            "date": runs.RUN_GUARD_DATE,
        }:
            raise AssertionError("unexpected update key")
        values = kwargs["ExpressionAttributeValues"]
        if self.guard_item is None or self.guard_item.get("owner_run_id") != values[":run_id"]:
            raise ConditionalCheckFailedException()
        self.guard_item.update(
            {
                "guard_until": values[":now"],
                "phase": values[":phase"],
                "released_at": values[":released_at"],
            }
        )
        self.journal.append("release")
        return {}


class FakeLambdaClient:
    def __init__(self, *, journal=None, status_code=202):
        self.calls = []
        self.status_code = status_code
        self.journal = journal if journal is not None else []

    def invoke(self, **kwargs):
        self.calls.append(kwargs)
        self.journal.append("invoke")
        return {"StatusCode": self.status_code}


class FakeAthenaClient:
    def __init__(self, state="RUNNING"):
        self.state = state
        self.start_calls = []
        self.get_calls = []
        self.result_calls = []

    def start_query_execution(self, **kwargs):
        self.start_calls.append(kwargs)
        return {"QueryExecutionId": "query-123"}

    def get_query_execution(self, **kwargs):
        self.get_calls.append(kwargs)
        return {
            "QueryExecution": {
                "Status": {"State": self.state},
                "Statistics": {"DataScannedInBytes": 42},
            }
        }

    def get_query_results(self, **kwargs):
        self.result_calls.append(kwargs)
        return {
            "ResultSet": {
                "ResultSetMetadata": {"ColumnInfo": [{"Name": "meal_date"}]},
                "Rows": [{"Data": [{"VarCharValue": "2026-08-10"}]}],
            }
        }


@pytest.mark.parametrize("metric", ["unknown", "_run#anything", "dau_wau'"])
def test_metric_allowlist_rejects_unknown_names_without_query(metric):
    table = FakeTable()
    response = metrics.handle(
        {
            "httpMethod": "GET",
            "pathParameters": {"metric": metric},
            "queryStringParameters": {"from": "2026-08-01", "to": "2026-08-10"},
        },
        table,
    )

    assert response["statusCode"] == 400
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
    assert table.query_calls == []


def test_metric_query_reads_latest_snapshot_and_filters_observation_dates():
    table = FakeTable(
        query_items=[
            {
                "metric": "match_rate",
                "date": "2026-08-09",
                "payload": json.dumps(
                    [
                        {"date": "2026-07-31", "match_rate": 0.5},
                        {"date": "2026-08-09", "match_rate": 0.75},
                        {"date": "2026-08-11", "match_rate": 0.8},
                    ]
                ),
                "count": Decimal("4"),
            }
        ]
    )
    response = metrics.handle(
        {
            "httpMethod": "GET",
            "pathParameters": {"metric": "match_rate"},
            "queryStringParameters": {"from": "2026-08-01", "to": "2026-08-10"},
        },
        table,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["items"][0]["payload"] == [
        {"date": "2026-08-09", "match_rate": 0.75}
    ]
    call = table.query_calls[0]
    assert call["KeyConditionExpression"] == "#metric = :metric"
    assert call["ExpressionAttributeValues"] == {":metric": "match_rate"}
    assert call["ScanIndexForward"] is False
    assert call["Limit"] == 1


def test_metric_query_keeps_undated_current_state_rows():
    table = FakeTable(
        query_items=[
            {
                "metric": "implausible_foods",
                "date": "2026-08-12",
                "payload": [{"id": "food-1", "reasons": ["macro_mismatch"]}],
            }
        ]
    )
    response = metrics.handle(
        {
            "httpMethod": "GET",
            "pathParameters": {"metric": "implausible_foods"},
            "queryStringParameters": {"from": "2026-08-01", "to": "2026-08-10"},
        },
        table,
    )

    assert response_body(response)["items"][0]["payload"] == [
        {"id": "food-1", "reasons": ["macro_mismatch"]}
    ]


@pytest.mark.parametrize(
    ("from_value", "to_value"),
    [
        (None, "2026-08-10"),
        ("2026-8-01", "2026-08-10"),
        ("2026-02-30", "2026-03-01"),
        ("2026-08-11", "2026-08-10"),
    ],
)
def test_date_validation_rejects_missing_malformed_or_reversed_ranges(
    from_value, to_value
):
    with pytest.raises(ApiError):
        validate_date_range(from_value, to_value)


def test_athena_template_rejects_sql_injection_date_before_rendering():
    with pytest.raises(ApiError):
        athena.render_athena_query(
            "macro_distribution_range",
            "2026-01-01 OR 1=1",
            "2026-01-31",
        )


def test_athena_start_uses_only_fixed_template_and_required_execution_settings():
    client = FakeAthenaClient()
    response = athena.handle(
        {
            "httpMethod": "POST",
            "body": json.dumps(
                {
                    "template_id": "latency_percentiles_range",
                    "from": "2026-08-01",
                    "to": "2026-08-10",
                }
            ),
        },
        client,
        workgroup="guarded-workgroup",
        database="curated_db",
        output="s3://analytics/athena-results/",
    )

    assert response["statusCode"] == 202
    assert response_body(response) == {"query_execution_id": "query-123"}
    call = client.start_calls[0]
    assert "v_pipeline_runs" in call["QueryString"]
    assert call["WorkGroup"] == "guarded-workgroup"
    assert call["QueryExecutionContext"] == {"Database": "curated_db"}
    assert call["ResultConfiguration"] == {
        "OutputLocation": "s3://analytics/athena-results/"
    }


def test_athena_poll_fetches_first_100_rows_only_after_success():
    client = FakeAthenaClient(state="SUCCEEDED")
    response = athena.handle(
        {
            "httpMethod": "GET",
            "pathParameters": {"id": "query-123"},
        },
        client,
        workgroup="wg",
        database="db",
        output="s3://bucket/results/",
    )

    assert response["statusCode"] == 200
    assert response_body(response)["status"] == "SUCCEEDED"
    assert client.result_calls == [
        {"QueryExecutionId": "query-123", "MaxResults": 100}
    ]


def test_run_start_returns_accepted_id_and_exact_async_payload():
    order = []
    table = FakeTable(journal=order)
    client = FakeLambdaClient(journal=order)
    response = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=client,
        function_name="extract-function",
        run_id_factory=lambda: "2cbac7f2-cb92-4959-86df-80b9778f33ee",
        now_factory=lambda: 1_000,
    )

    assert response["statusCode"] == 202
    assert response_body(response) == {
        "run_id": "2cbac7f2-cb92-4959-86df-80b9778f33ee",
        "next_allowed_at": "1970-01-01T00:46:40Z",
    }
    call = client.calls[0]
    assert call["FunctionName"] == "extract-function"
    assert call["InvocationType"] == "Event"
    assert json.loads(call["Payload"]) == {
        "mode": "on_demand",
        "run_id": "2cbac7f2-cb92-4959-86df-80b9778f33ee",
    }
    # The status item must exist before the invoke, or the dashboard's first
    # poll races the extract Lambda and reads a hard 404.
    assert order == ["claim", "put_item", "invoke"]
    assert table.puts[0]["metric"] == "_run#2cbac7f2-cb92-4959-86df-80b9778f33ee"
    assert table.puts[0]["phase"] == "queued"


def test_run_start_rejects_a_second_claim_with_authoritative_retry_metadata():
    table = FakeTable()
    first_client = FakeLambdaClient()
    first = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=first_client,
        function_name="extract-function",
        run_id_factory=lambda: "run-first",
        now_factory=lambda: 1_000,
    )
    second_client = FakeLambdaClient()
    second = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=second_client,
        function_name="extract-function",
        run_id_factory=lambda: "run-second",
        now_factory=lambda: 1_000,
    )

    assert first["statusCode"] == 202
    assert second["statusCode"] == 429
    assert response_body(second) == {
        "error": "an analytics snapshot is already running or was started recently",
        "retry_after": 1800,
        "next_allowed_at": "1970-01-01T00:46:40Z",
    }
    assert second["headers"]["Retry-After"] == "1800"
    assert second_client.calls == []
    assert [call["Key"] for call in table.get_calls] == [
        {"metric": runs.RUN_GUARD_METRIC, "date": runs.RUN_GUARD_DATE}
    ]


def test_run_start_can_claim_an_expired_server_guard():
    table = FakeTable()
    first_client = FakeLambdaClient()
    runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=first_client,
        function_name="extract-function",
        run_id_factory=lambda: "run-first",
        now_factory=lambda: 1_000,
    )
    second_client = FakeLambdaClient()
    second = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=second_client,
        function_name="extract-function",
        run_id_factory=lambda: "run-second",
        now_factory=lambda: 2_800,
    )

    assert second["statusCode"] == 202
    assert response_body(second)["run_id"] == "run-second"
    assert table.guard_item["owner_run_id"] == "run-second"
    assert len(second_client.calls) == 1


def test_run_start_marks_the_run_failed_when_the_invoke_is_rejected():
    table = FakeTable()
    client = FakeLambdaClient(status_code=500)
    response = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=client,
        function_name="extract-function",
        run_id_factory=lambda: "run-99",
        now_factory=lambda: 1_000,
    )

    assert response["statusCode"] == 500
    # A rejected invoke must not leave the run stuck at "queued" forever.
    assert [put["phase"] for put in table.puts] == ["queued", "failed"]
    assert table.puts[-1]["failure_reason"] == "start_failed"
    assert table.guard_item["owner_run_id"] == "run-99"
    assert table.guard_item["phase"] == "released"
    assert table.guard_item["guard_until"] == 1_000


def test_run_start_can_retry_after_invoke_failure_releases_guard():
    table = FakeTable()
    failed = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=FakeLambdaClient(status_code=500),
        function_name="extract-function",
        run_id_factory=lambda: "run-failed",
        now_factory=lambda: 1_000,
    )
    retried_client = FakeLambdaClient()
    retried = runs.handle(
        {"httpMethod": "POST"},
        table=table,
        lambda_client=retried_client,
        function_name="extract-function",
        run_id_factory=lambda: "run-retried",
        now_factory=lambda: 1_000,
    )

    assert failed["statusCode"] == 500
    assert retried["statusCode"] == 202
    assert len(retried_client.calls) == 1


def test_run_poll_reads_run_status_record_and_returns_record_shape():
    table = FakeTable(
        run_item={
            "metric": "_run#run-42",
            "date": "latest",
            "run_id": "run-42",
            "phase": "transform_started",
        }
    )
    response = runs.handle(
        {"httpMethod": "GET", "pathParameters": {"run_id": "run-42"}},
        table=table,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["phase"] == "transform_started"
    assert table.get_calls[0]["Key"] == {
        "metric": "_run#run-42",
        "date": "latest",
    }
    assert table.get_calls[0]["ConsistentRead"] is True
    assert table.guard_item is None


def test_insight_context_is_compact_and_decodes_aggregate_payloads():
    context = build_insight_context(
        {
            "match_rate": [
                {
                    "metric": "match_rate",
                    "date": "2026-08-10",
                    "payload": '{"matched_count":9,"match_rate":0.9}',
                }
            ],
            "dau_wau": [
                {
                    "metric": "dau_wau",
                    "date": "2026-08-10",
                    "payload": '[{"dau":12,"wau":40}]',
                }
            ],
        },
        "2026-08-04",
        "2026-08-10",
    )

    assert context["period"] == {"from": "2026-08-04", "to": "2026-08-10"}
    assert context["metrics"]["match_rate"] == [
        {
            "date": "2026-08-10",
            "data": {"matched_count": 9, "match_rate": 0.9},
        }
    ]
    assert context["metrics"]["dau_wau"][0]["data"] == [{"dau": 12, "wau": 40}]


class FakeSecrets:
    def get_secret_value(self, **kwargs):
        return {"SecretString": "gemini-test-key"}


class FailedHttp:
    def request(self, *args, **kwargs):
        return SimpleNamespace(status=503, data=b'{"error":"upstream detail"}')


def test_insight_returns_clean_502_when_gemini_fails(monkeypatch):
    monkeypatch.setattr(insight, "_gemini_api_key", None)
    response = insight.handle(
        {"httpMethod": "POST"},
        table=FakeTable(),
        secrets_client=FakeSecrets(),
        http_client=FailedHttp(),
        secret_arn="secret-arn",
        now=datetime(2026, 8, 10, tzinfo=timezone.utc),
    )

    assert response["statusCode"] == 502
    assert response_body(response) == {
        "error": "Weekly summary is temporarily unavailable"
    }
    assert "upstream" not in response["body"]
