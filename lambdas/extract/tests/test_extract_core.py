from __future__ import annotations

import json
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest

EXTRACT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EXTRACT_DIR))

from extract_core import (  # noqa: E402
    PostgrestError,
    TransientHttpError,
    VIEW_CONFIGS,
    ViewResult,
    build_manifest,
    extract_view,
    request_page,
    run_extraction,
)


FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 8, 10, 4, 30, tzinfo=timezone.utc)


@dataclass
class FakeResponse:
    status: int
    data: bytes

    @classmethod
    def json(cls, payload: Any, status: int = 200) -> "FakeResponse":
        return cls(status, json.dumps(payload).encode("utf-8"))


class FakeHttp:
    def __init__(
        self,
        responder: Callable[[str, Mapping[str, str]], FakeResponse],
    ) -> None:
        self.responder = responder
        self.calls: list[dict[str, Any]] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> FakeResponse:
        self.calls.append(
            {"method": method, "url": url, "headers": dict(headers), "timeout": timeout}
        )
        return self.responder(url, headers)


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.calls: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]
        return {"ETag": "fake"}


class FakeTable:
    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items: dict[tuple[str, str], dict[str, Any]] = {}
        self.puts: list[dict[str, Any]] = []
        for item in items or []:
            self._store(item)

    @staticmethod
    def _key(item: Mapping[str, Any]) -> tuple[str, str]:
        return item["metric"], item["date"]

    def _store(self, item: dict[str, Any]) -> None:
        self.items[self._key(item)] = dict(item)

    def get_item(self, **kwargs: Any) -> dict[str, Any]:
        item = self.items.get(self._key(kwargs["Key"]))
        return {} if item is None else {"Item": dict(item)}

    def put_item(self, **kwargs: Any) -> dict[str, Any]:
        item = dict(kwargs["Item"])
        self.puts.append(item)
        self._store(item)
        return {}


class FakeGlue:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def start_job_run(self, **kwargs: Any) -> dict[str, str]:
        self.calls.append(kwargs)
        return {"JobRunId": "jr_fake_123"}


def fixture_rows(view_name: str) -> list[dict[str, Any]]:
    path = FIXTURES / f"sample_{view_name}.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()]


def view_from_url(url: str) -> str:
    return urlparse(url).path.rsplit("/", 1)[-1]


def test_fixtures_have_three_to_five_rows_and_exact_allowlists() -> None:
    for config in VIEW_CONFIGS:
        rows = fixture_rows(config.name)
        assert 3 <= len(rows) <= 5
        assert all(tuple(row) == config.columns for row in rows)


def test_pagination_assembles_jsonl_files_and_advances_watermark() -> None:
    config = VIEW_CONFIGS[0]
    rows = fixture_rows(config.name)

    def respond(url: str, headers: Mapping[str, str]) -> FakeResponse:
        assert parse_qs(urlparse(url).query)["select"] == [",".join(config.columns)]
        assert parse_qs(urlparse(url).query)["order"] == ["created_at.asc"]
        start, end = (int(value) for value in headers["Range"].split("-"))
        return FakeResponse.json(rows[start : end + 1], status=206)

    http = FakeHttp(respond)
    s3 = FakeS3()
    table = FakeTable()
    result = extract_view(
        config=config,
        extraction_date="2026-08-10",
        base_url="https://project.supabase.co/",
        analytics_jwt="restricted-jwt",
        api_key="gateway-key",
        bucket="analytics-bucket",
        http_client=http,
        s3_client=s3,
        table=table,
        clock=lambda: NOW,
        sleeper=lambda _: None,
        page_size=2,
    )

    assert result.rows == len(rows)
    assert result.files == (
        "raw/v_pipeline_runs/dt=2026-08-10/part-0.jsonl",
        "raw/v_pipeline_runs/dt=2026-08-10/part-1.jsonl",
    )
    assembled = []
    for key in result.files:
        assembled.extend(
            json.loads(line)
            for line in s3.objects[("analytics-bucket", key)].decode().splitlines()
        )
    assert assembled == rows
    assert [call["headers"]["Range"] for call in http.calls] == ["0-1", "2-3"]
    assert all(call["headers"]["Range-Unit"] == "items" for call in http.calls)
    assert all(call["headers"]["Accept-Profile"] == "analytics" for call in http.calls)
    stored_watermark = table.items[("_watermark#v_pipeline_runs", "latest")]
    assert stored_watermark["watermark"] == rows[-1]["created_at"]


def test_failed_view_does_not_advance_its_watermark_or_publish_manifest() -> None:
    first, failing = VIEW_CONFIGS[:2]
    first_rows = fixture_rows(first.name)[:1]
    failing_rows = fixture_rows(failing.name)[:1]
    old_first = "2026-08-01T00:00:00Z"
    old_failing = "2026-08-02T00:00:00Z"
    table = FakeTable(
        [
            {
                "metric": f"_watermark#{first.name}",
                "date": "latest",
                "watermark": old_first,
            },
            {
                "metric": f"_watermark#{failing.name}",
                "date": "latest",
                "watermark": old_failing,
            },
        ]
    )
    failing_calls = 0

    def respond(url: str, headers: Mapping[str, str]) -> FakeResponse:
        nonlocal failing_calls
        view = view_from_url(url)
        if view == first.name:
            return FakeResponse.json(
                first_rows if headers["Range"].startswith("0-") else []
            )
        if view == failing.name:
            failing_calls += 1
            if failing_calls == 1:
                return FakeResponse.json(failing_rows)
            return FakeResponse.json({"message": "bad filter"}, status=400)
        raise AssertionError(view)

    s3 = FakeS3()
    glue = FakeGlue()
    with pytest.raises(PostgrestError, match="non-retryable 400"):
        run_extraction(
            event=None,
            base_url="https://project.supabase.co",
            analytics_jwt="jwt",
            api_key="api-key",
            bucket="bucket",
            glue_job_name="etl-job",
            http_client=FakeHttp(respond),
            s3_client=s3,
            table=table,
            glue_client=glue,
            clock=lambda: NOW,
            sleeper=lambda _: None,
            view_configs=(first, failing),
            page_size=1,
        )

    stored_first = table.items[(f"_watermark#{first.name}", "latest")]
    assert stored_first["watermark"] == first_rows[-1]["created_at"]
    assert table.items[(f"_watermark#{failing.name}", "latest")]["watermark"] == old_failing
    assert not any("/_manifests/" in key for _, key in s3.objects)
    assert glue.calls == []


def test_build_manifest_has_locked_shape() -> None:
    manifest = build_manifest(
        run_id="run-42",
        views={
            "v_meals": ViewResult(
                3,
                ("raw/v_meals/dt=2026-08-10/part-0.jsonl",),
                "2026-08-10T03:00:00Z",
            )
        },
        started_at=NOW,
        finished_at=datetime(2026, 8, 10, 4, 31, tzinfo=timezone.utc),
    )
    assert manifest == {
        "run_id": "run-42",
        "views": {
            "v_meals": {
                "rows": 3,
                "files": ["raw/v_meals/dt=2026-08-10/part-0.jsonl"],
            }
        },
        "started_at": "2026-08-10T04:30:00Z",
        "finished_at": "2026-08-10T04:31:00Z",
    }


def test_on_demand_statuses_and_single_start_job_run() -> None:
    http = FakeHttp(
        lambda url, _headers: FakeResponse.json(fixture_rows(view_from_url(url)))
    )
    s3 = FakeS3()
    table = FakeTable()
    glue = FakeGlue()

    result = run_extraction(
        event={"mode": "on_demand", "run_id": "manual-run-7"},
        base_url="https://project.supabase.co",
        analytics_jwt="jwt",
        api_key="api-key",
        bucket="bucket",
        glue_job_name="etl-job",
        http_client=http,
        s3_client=s3,
        table=table,
        glue_client=glue,
        clock=lambda: NOW,
        sleeper=lambda _: None,
    )

    assert set(result.manifest["views"]) == {config.name for config in VIEW_CONFIGS}
    assert len(glue.calls) == 1
    assert glue.calls[0] == {
        "JobName": "etl-job",
        "Arguments": {
            "--run_id": "manual-run-7",
            "--manifest_key": "raw/_manifests/dt=2026-08-10/manifest.json",
        },
    }
    statuses = [
        item
        for item in table.puts
        if item["metric"] == "_run#manual-run-7"
    ]
    assert [item["phase"] for item in statuses] == [
        "extracting",
        "transform_started",
    ]
    assert statuses[-1]["manifest_key"] == result.manifest_key
    assert statuses[-1]["glue_job_run_id"] == "jr_fake_123"
    manifest_body = s3.objects[("bucket", result.manifest_key)]
    assert json.loads(manifest_body) == result.manifest


def test_full_refresh_never_reads_or_writes_a_watermark() -> None:
    config = VIEW_CONFIGS[-1]
    rows = fixture_rows(config.name)
    table = FakeTable(
        [
            {
                "metric": f"_watermark#{config.name}",
                "date": "latest",
                "watermark": "should-be-ignored",
            }
        ]
    )
    http = FakeHttp(lambda _url, _headers: FakeResponse.json(rows))
    extract_view(
        config=config,
        extraction_date="2026-08-10",
        base_url="https://project.supabase.co",
        analytics_jwt="jwt",
        api_key="api-key",
        bucket="bucket",
        http_client=http,
        s3_client=FakeS3(),
        table=table,
        clock=lambda: NOW,
        sleeper=lambda _: None,
    )
    query = parse_qs(urlparse(http.calls[0]["url"]).query)
    assert "created_at" not in query
    assert not any(
        item["metric"] == f"_watermark#{config.name}" for item in table.puts
    )


def test_page_retries_5xx_with_backoff_but_not_4xx() -> None:
    responses = [
        FakeResponse.json({"message": "temporary"}, status=503),
        FakeResponse.json({"message": "temporary"}, status=500),
        FakeResponse.json([{"id": "ok"}]),
    ]
    retrying_http = FakeHttp(lambda _url, _headers: responses.pop(0))
    delays: list[float] = []
    assert request_page(
        http_client=retrying_http,
        url="https://project.supabase.co/rest/v1/v_food_composition",
        analytics_jwt="jwt",
        api_key="api-key",
        page_number=0,
        sleeper=delays.append,
    ) == [{"id": "ok"}]
    assert len(retrying_http.calls) == 3
    assert delays == [0.5, 1.0]

    denied_http = FakeHttp(
        lambda _url, _headers: FakeResponse.json(
            {"message": "permission denied"}, status=403
        )
    )
    with pytest.raises(PostgrestError, match="non-retryable 403"):
        request_page(
            http_client=denied_http,
            url="https://project.supabase.co/rest/v1/v_food_composition",
            analytics_jwt="jwt",
            api_key="api-key",
            page_number=0,
            sleeper=lambda _: pytest.fail("4xx response must not back off"),
        )
    assert len(denied_http.calls) == 1


def test_page_retries_timeout() -> None:
    attempts = 0

    def respond(_url: str, _headers: Mapping[str, str]) -> FakeResponse:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise TransientHttpError("read timed out")
        return FakeResponse.json([])

    delays: list[float] = []
    assert request_page(
        http_client=FakeHttp(respond),
        url="https://project.supabase.co/rest/v1/v_food_composition",
        analytics_jwt="jwt",
        api_key="api-key",
        page_number=0,
        sleeper=delays.append,
    ) == []
    assert attempts == 2
    assert delays == [0.5]
