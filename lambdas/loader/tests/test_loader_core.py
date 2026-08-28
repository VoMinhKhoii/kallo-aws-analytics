from __future__ import annotations

import copy
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest


LOADER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LOADER_DIR))

from loader_core import (  # noqa: E402
    FAILED_GLUE_STATES,
    LoadContext,
    MalformedAggregateError,
    event_run_id,
    glue_event_state,
    load_aggregates,
    mark_run_failed,
    resolve_load_context,
)


class FakeS3:
    def __init__(
        self,
        objects: dict[str, Any],
        modified: dict[str, datetime] | None = None,
    ) -> None:
        self.objects = {
            key: value
            if isinstance(value, bytes)
            else json.dumps(value).encode("utf-8")
            for key, value in objects.items()
        }
        self.modified = modified or {}

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        return {"Body": io.BytesIO(self.objects[kwargs["Key"]])}

    def list_objects_v2(self, **kwargs: Any) -> dict[str, Any]:
        prefix = kwargs["Prefix"]
        contents: list[dict[str, Any]] = []
        for key in sorted(self.objects):
            if not key.startswith(prefix):
                continue
            item: dict[str, Any] = {"Key": key}
            if key in self.modified:
                item["LastModified"] = self.modified[key]
            contents.append(item)
        return {"Contents": contents, "IsTruncated": False}


class FakeGlue:
    def __init__(self, arguments: dict[str, str]) -> None:
        self.arguments = arguments
        self.calls: list[dict[str, Any]] = []

    def get_job_run(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {"JobRun": {"Arguments": self.arguments}}


class FakeTable:
    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict[str, Any]] = {}
        self.puts: list[dict[str, Any]] = []
        self.updates: list[dict[str, Any]] = []

    def put_item(self, **kwargs: Any) -> dict[str, Any]:
        item = dict(kwargs["Item"])
        self.puts.append(item)
        self.items[(item["metric"], item["date"])] = item
        return {}

    def update_item(self, **kwargs: Any) -> dict[str, Any]:
        self.updates.append(kwargs)
        key = kwargs["Key"]
        item = self.items.setdefault((key["metric"], key["date"]), dict(key))
        values = kwargs["ExpressionAttributeValues"]
        if ":failed" in values:
            item.update(
                {
                    "phase": values[":failed"],
                    "updated_at": values[":updated_at"],
                    "failure_reason": values[":failure_reason"],
                }
            )
            return {}
        item.update(
            {
                "phase": values[":completed"],
                "completed_at": values[":completed_at"],
                "updated_at": values[":completed_at"],
                "manifest_key": values[":manifest_key"],
                "run_id": values[":run_id"],
            }
        )
        return {}


MANIFEST_KEY = "raw/_manifests/dt=2026-08-10/run=run-42/manifest.json"


def context() -> LoadContext:
    return LoadContext(
        bucket="analytics-bucket",
        manifest_key=MANIFEST_KEY,
        run_id="run-42",
        date="2026-08-10",
        completed_at="2026-08-10T04:31:00Z",
    )


def test_double_apply_is_idempotent_and_completes_run_status() -> None:
    s3 = FakeS3(
        {
            "aggregates/dt=2026-08-10/run=run-42/dau_wau.json": [
                {"date": "2026-08-10", "dau": 3, "wau": 9}
            ],
            "aggregates/dt=2026-08-10/run=run-42/onboarding_funnel.json": {
                "total_users": 3,
                "completion_share": 0.333333,
            },
        }
    )
    table = FakeTable()

    first = load_aggregates(table=table, s3_client=s3, context=context())
    state_after_first = copy.deepcopy(table.items)
    second = load_aggregates(table=table, s3_client=s3, context=context())

    assert first == second
    assert table.items == state_after_first
    assert json.loads(table.items[("dau_wau", "2026-08-10")]["payload"]) == [
        {"date": "2026-08-10", "dau": 3, "wau": 9}
    ]
    assert table.items[("_run#run-42", "latest")] == {
        "metric": "_run#run-42",
        "date": "latest",
        "phase": "completed",
        "completed_at": "2026-08-10T04:31:00Z",
        "updated_at": "2026-08-10T04:31:00Z",
        "manifest_key": MANIFEST_KEY,
        "run_id": "run-42",
    }


def test_malformed_aggregate_causes_no_partial_writes_or_completion() -> None:
    s3 = FakeS3(
        {
            "aggregates/dt=2026-08-10/run=run-42/dau_wau.json": [],
            "aggregates/dt=2026-08-10/run=run-42/match_rate.json": b"{not-json",
        }
    )
    table = FakeTable()

    with pytest.raises(MalformedAggregateError, match="not valid UTF-8 JSON"):
        load_aggregates(table=table, s3_client=s3, context=context())

    assert table.items == {}
    assert table.puts == []
    assert table.updates == []


def test_context_uses_glue_job_arguments_and_manifest() -> None:
    manifest_key = MANIFEST_KEY
    s3 = FakeS3(
        {
            manifest_key: {
                "run_id": "run-42",
                "started_at": "2026-08-10T04:30:00Z",
                "finished_at": "2026-08-10T04:31:00Z",
                "views": {},
            }
        }
    )
    glue = FakeGlue({"--run_id": "run-42", "--manifest_key": manifest_key})
    resolved = resolve_load_context(
        event={
            "detail": {
                "state": "SUCCEEDED",
                "jobName": "kallo-etl",
                "jobRunId": "jr_123",
            }
        },
        default_bucket="analytics-bucket",
        s3_client=s3,
        glue_client=glue,
    )
    assert resolved == context()
    assert glue.calls == [
        {
            "JobName": "kallo-etl",
            "RunId": "jr_123",
            "PredecessorsIncluded": False,
        }
    ]


def test_context_falls_back_to_latest_manifest() -> None:
    old_key = "raw/_manifests/dt=2026-08-09/run=old/manifest.json"
    latest_key = MANIFEST_KEY
    s3 = FakeS3(
        {
            old_key: {"run_id": "old", "finished_at": "2026-08-09T02:00:00Z"},
            latest_key: {
                "run_id": "run-42",
                "finished_at": "2026-08-10T04:31:00Z",
            },
        }
    )
    resolved = resolve_load_context(
        event={"detail": {"state": "SUCCEEDED"}},
        default_bucket="analytics-bucket",
        s3_client=s3,
    )
    assert resolved == context()


def test_second_same_day_run_loads_only_its_own_aggregates() -> None:
    """Two runs on one day must not blend metric generations.

    The first run leaves a metric the second no longer produces; loading the
    second must replace the payloads it does produce and ignore the stale file
    entirely, which the shared ``dt=`` prefix could not guarantee.
    """

    s3 = FakeS3(
        {
            "aggregates/dt=2026-08-10/run=run-41/dau_wau.json": [{"dau": 1}],
            "aggregates/dt=2026-08-10/run=run-41/retired_metric.json": [{"old": True}],
            "aggregates/dt=2026-08-10/run=run-42/dau_wau.json": [{"dau": 7}],
        }
    )
    table = FakeTable()

    result = load_aggregates(table=table, s3_client=s3, context=context())

    assert result.metrics == ("dau_wau",)
    assert json.loads(table.items[("dau_wau", "2026-08-10")]["payload"]) == [{"dau": 7}]
    assert ("retired_metric", "2026-08-10") not in table.items


def test_latest_manifest_breaks_a_same_day_tie_by_write_time() -> None:
    first = "raw/_manifests/dt=2026-08-10/run=zzz-earlier/manifest.json"
    second = "raw/_manifests/dt=2026-08-10/run=aaa-later/manifest.json"
    s3 = FakeS3(
        {
            first: {"run_id": "zzz-earlier", "finished_at": "2026-08-10T04:00:00Z"},
            second: {"run_id": "run-42", "finished_at": "2026-08-10T04:31:00Z"},
        },
        modified={
            first: datetime(2026, 8, 10, 4, 0, tzinfo=timezone.utc),
            second: datetime(2026, 8, 10, 4, 31, tzinfo=timezone.utc),
        },
    )

    resolved = resolve_load_context(
        event={"detail": {"state": "SUCCEEDED"}},
        default_bucket="analytics-bucket",
        s3_client=s3,
    )

    # Run ids are random UUIDs, so sorting by key alone would have picked the
    # lexicographically larger "zzz-earlier" over the run that actually ran last.
    assert resolved.manifest_key == second
    assert resolved.run_id == "run-42"


def test_glue_failure_states_are_recognised_and_end_the_run() -> None:
    assert FAILED_GLUE_STATES == {"FAILED", "TIMEOUT", "STOPPED"}

    event = {
        "detail": {
            "state": "FAILED",
            "jobName": "kallo-etl",
            "jobRunId": "jr_9",
            "arguments": {"--run_id": "run-42"},
        }
    }
    assert glue_event_state(event) == "FAILED"
    assert event_run_id(event) == "run-42"

    table = FakeTable()
    mark_run_failed(
        table=table,
        run_id="run-42",
        failure_reason="glue_failed",
        updated_at="2026-08-10T04:40:00Z",
    )

    item = table.items[("_run#run-42", "latest")]
    assert item["phase"] == "failed"
    assert item["failure_reason"] == "glue_failed"


def test_a_succeeded_event_is_not_treated_as_a_failure() -> None:
    assert glue_event_state({"detail": {"state": "SUCCEEDED"}}) not in FAILED_GLUE_STATES
    assert glue_event_state({}) is None
