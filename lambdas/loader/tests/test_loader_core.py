from __future__ import annotations

import copy
import io
import json
import sys
from pathlib import Path
from typing import Any

import pytest


LOADER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LOADER_DIR))

from loader_core import (  # noqa: E402
    LoadContext,
    MalformedAggregateError,
    load_aggregates,
    resolve_load_context,
)


class FakeS3:
    def __init__(self, objects: dict[str, Any]) -> None:
        self.objects = {
            key: value
            if isinstance(value, bytes)
            else json.dumps(value).encode("utf-8")
            for key, value in objects.items()
        }

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        return {"Body": io.BytesIO(self.objects[kwargs["Key"]])}

    def list_objects_v2(self, **kwargs: Any) -> dict[str, Any]:
        prefix = kwargs["Prefix"]
        return {
            "Contents": [
                {"Key": key} for key in sorted(self.objects) if key.startswith(prefix)
            ],
            "IsTruncated": False,
        }


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


def context() -> LoadContext:
    return LoadContext(
        bucket="analytics-bucket",
        manifest_key="raw/_manifests/dt=2026-08-10/manifest.json",
        run_id="run-42",
        date="2026-08-10",
        completed_at="2026-08-10T04:31:00Z",
    )


def test_double_apply_is_idempotent_and_completes_run_status() -> None:
    s3 = FakeS3(
        {
            "aggregates/dt=2026-08-10/dau_wau.json": [
                {"date": "2026-08-10", "dau": 3, "wau": 9}
            ],
            "aggregates/dt=2026-08-10/onboarding_funnel.json": {
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
        "manifest_key": "raw/_manifests/dt=2026-08-10/manifest.json",
        "run_id": "run-42",
    }


def test_malformed_aggregate_causes_no_partial_writes_or_completion() -> None:
    s3 = FakeS3(
        {
            "aggregates/dt=2026-08-10/dau_wau.json": [],
            "aggregates/dt=2026-08-10/match_rate.json": b"{not-json",
        }
    )
    table = FakeTable()

    with pytest.raises(MalformedAggregateError, match="not valid UTF-8 JSON"):
        load_aggregates(table=table, s3_client=s3, context=context())

    assert table.items == {}
    assert table.puts == []
    assert table.updates == []


def test_context_uses_glue_job_arguments_and_manifest() -> None:
    manifest_key = "raw/_manifests/dt=2026-08-10/manifest.json"
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
    old_key = "raw/_manifests/dt=2026-08-09/manifest.json"
    latest_key = "raw/_manifests/dt=2026-08-10/manifest.json"
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
