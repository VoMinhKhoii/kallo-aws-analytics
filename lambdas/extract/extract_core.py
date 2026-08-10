"""Unit-testable orchestration for the Supabase analytics extract.

This module deliberately depends on small client protocols rather than boto3 or
urllib3.  The Lambda entrypoint supplies those runtime adapters, while tests can
use hand-written fakes.
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.parse import quote, urlencode


PAGE_SIZE = 1_000
# One initial request plus the required three retries.
MAX_PAGE_ATTEMPTS = 4
HTTP_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class ViewConfig:
    """The only source views and columns the extractor is allowed to read."""

    name: str
    columns: tuple[str, ...]
    cursor_column: str | None
    order_column: str

    @property
    def full_refresh(self) -> bool:
        return self.cursor_column is None


VIEW_CONFIGS: tuple[ViewConfig, ...] = (
    ViewConfig(
        "v_pipeline_runs",
        (
            "id",
            "created_at",
            "pipeline_version",
            "model_call1",
            "model_call2",
            "total_ms",
            "ingredient_count",
            "matched_count",
            "unmatched_count",
            "retry_count",
            "escalated",
            "cache_hit_l4",
        ),
        "created_at",
        "created_at",
    ),
    ViewConfig(
        "v_budget_events",
        (
            "id",
            "created_at",
            "request_id",
            "route",
            "work_kind",
            "provider",
            "model",
            "request_count",
            "input_tokens",
            "output_tokens",
            "error_category",
        ),
        "created_at",
        "created_at",
    ),
    ViewConfig(
        "v_meals",
        (
            "id",
            "user_hash",
            "logged_at",
            "meal_slot",
            "entry_mode",
            "confidence_overall",
            "calories_kcal",
            "protein_g",
            "carbohydrate_g",
            "fat_g",
            "fiber_g",
        ),
        "logged_at",
        "logged_at",
    ),
    ViewConfig(
        "v_meal_items",
        (
            "id",
            "meal_id",
            "ingredient_name",
            "food_composition_id",
            "estimated_grams",
            "match_confidence",
            "cooking_method",
            "created_at",
        ),
        "created_at",
        "created_at",
    ),
    ViewConfig(
        "v_unmatched_ingredients",
        ("id", "query_text", "created_at"),
        "created_at",
        "created_at",
    ),
    ViewConfig(
        "v_user_funnel",
        (
            "user_hash",
            "created_at",
            "onboarding_step",
            "onboarding_completed_at",
            "goal",
            "preferred_locale",
        ),
        "created_at",
        "created_at",
    ),
    ViewConfig(
        "v_food_composition",
        (
            "id",
            "name_en",
            "type_en",
            "state",
            "source_id",
            "serving_size_g",
            "calories_kcal",
            "protein_g",
            "carbohydrate_g",
            "fat_g",
            "fiber_g",
        ),
        None,
        "id",
    ),
)


class HttpResponse(Protocol):
    status: int
    data: bytes


class HttpClient(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> HttpResponse: ...


class S3Client(Protocol):
    def put_object(self, **kwargs: Any) -> Mapping[str, Any]: ...


class DynamoTable(Protocol):
    def get_item(self, **kwargs: Any) -> Mapping[str, Any]: ...

    def put_item(self, **kwargs: Any) -> Mapping[str, Any]: ...


class GlueClient(Protocol):
    def start_job_run(self, **kwargs: Any) -> Mapping[str, Any]: ...


class TransientHttpError(RuntimeError):
    """A network timeout that is safe to retry for the current page."""


class PostgrestError(RuntimeError):
    """A non-success response or invalid JSON payload from PostgREST."""


@dataclass(frozen=True)
class ViewResult:
    rows: int
    files: tuple[str, ...]
    watermark: str | None


@dataclass(frozen=True)
class ExtractionResult:
    run_id: str
    manifest_key: str
    manifest: dict[str, Any]
    glue_job_run_id: str | None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_timestamp(value: datetime) -> str:
    """Return an RFC 3339 UTC timestamp with a stable ``Z`` suffix."""

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def read_watermark(table: DynamoTable, view_name: str) -> str | None:
    response = table.get_item(
        Key={"metric": f"_watermark#{view_name}", "date": "latest"},
        ConsistentRead=True,
    )
    item = response.get("Item")
    if not isinstance(item, Mapping):
        return None
    value = item.get("watermark")
    return value if isinstance(value, str) and value else None


def write_watermark(
    table: DynamoTable,
    config: ViewConfig,
    watermark: str,
    updated_at: datetime,
) -> None:
    table.put_item(
        Item={
            "metric": f"_watermark#{config.name}",
            "date": "latest",
            "watermark": watermark,
            "cursor_column": config.cursor_column,
            "updated_at": format_timestamp(updated_at),
        }
    )


def write_run_status(
    table: DynamoTable,
    run_id: str,
    phase: str,
    updated_at: datetime,
    **details: str,
) -> None:
    item = {
        "metric": f"_run#{run_id}",
        "date": "latest",
        "run_id": run_id,
        "phase": phase,
        "updated_at": format_timestamp(updated_at),
    }
    item.update(details)
    table.put_item(Item=item)


def _request_url(
    base_url: str,
    config: ViewConfig,
    watermark: str | None,
) -> str:
    query: list[tuple[str, str]] = [
        ("select", ",".join(config.columns)),
        ("order", f"{config.order_column}.asc"),
    ]
    if config.cursor_column is not None and watermark is not None:
        query.append((config.cursor_column, f"gt.{watermark}"))
    path = f"{base_url.rstrip('/')}/rest/v1/{quote(config.name, safe='')}"
    return f"{path}?{urlencode(query)}"


def _response_message(response: HttpResponse) -> str:
    try:
        return response.data.decode("utf-8", errors="replace")[:500]
    except AttributeError:
        return repr(response.data)[:500]


def request_page(
    *,
    http_client: HttpClient,
    url: str,
    analytics_jwt: str,
    api_key: str,
    page_number: int,
    page_size: int = PAGE_SIZE,
    sleeper: Callable[[float], None] = time.sleep,
    max_attempts: int = MAX_PAGE_ATTEMPTS,
) -> list[dict[str, Any]]:
    """Fetch one Range page, retrying only timeouts and 5xx responses."""

    range_start = page_number * page_size
    headers = {
        "Accept-Profile": "analytics",
        "Authorization": f"Bearer {analytics_jwt}",
        "apikey": api_key,
        "Range-Unit": "items",
        "Range": f"{range_start}-{range_start + page_size - 1}",
    }

    response: HttpResponse | None = None
    for attempt in range(max_attempts):
        try:
            response = http_client.request(
                "GET",
                url,
                headers=headers,
                timeout=HTTP_TIMEOUT_SECONDS,
            )
        except (TransientHttpError, TimeoutError):
            if attempt + 1 == max_attempts:
                raise
            sleeper(0.5 * (2**attempt))
            continue

        if 500 <= response.status <= 599:
            if attempt + 1 == max_attempts:
                raise PostgrestError(
                    f"PostgREST returned {response.status} after {max_attempts} "
                    f"attempts: {_response_message(response)}"
                )
            sleeper(0.5 * (2**attempt))
            continue
        if 400 <= response.status <= 499:
            raise PostgrestError(
                f"PostgREST returned non-retryable {response.status}: "
                f"{_response_message(response)}"
            )
        if response.status not in (200, 206):
            raise PostgrestError(
                f"PostgREST returned unexpected {response.status}: "
                f"{_response_message(response)}"
            )
        break

    if response is None:  # Defensive: max_attempts is a public test seam.
        raise ValueError("max_attempts must be at least 1")

    try:
        payload = json.loads(response.data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PostgrestError("PostgREST returned invalid JSON") from error
    if not isinstance(payload, list) or not all(
        isinstance(row, dict) for row in payload
    ):
        raise PostgrestError("PostgREST page must be a JSON array of objects")
    return payload


def encode_json_lines(rows: Sequence[Mapping[str, Any]]) -> bytes:
    return (
        "".join(
            json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            for row in rows
        )
    ).encode("utf-8")


def extract_view(
    *,
    config: ViewConfig,
    extraction_date: str,
    base_url: str,
    analytics_jwt: str,
    api_key: str,
    bucket: str,
    http_client: HttpClient,
    s3_client: S3Client,
    table: DynamoTable,
    clock: Callable[[], datetime] = utc_now,
    sleeper: Callable[[float], None] = time.sleep,
    page_size: int = PAGE_SIZE,
) -> ViewResult:
    """Extract a view and advance its watermark only after every page succeeds."""

    previous_watermark = (
        None if config.full_refresh else read_watermark(table, config.name)
    )
    url = _request_url(base_url, config, previous_watermark)
    files: list[str] = []
    row_count = 0
    next_watermark = previous_watermark
    page_number = 0

    while True:
        rows = request_page(
            http_client=http_client,
            url=url,
            analytics_jwt=analytics_jwt,
            api_key=api_key,
            page_number=page_number,
            page_size=page_size,
            sleeper=sleeper,
        )
        if not rows:
            break

        key = (
            f"raw/{config.name}/dt={extraction_date}/"
            f"part-{page_number}.jsonl"
        )
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=encode_json_lines(rows),
            ContentType="application/x-ndjson",
        )
        files.append(key)
        row_count += len(rows)

        if config.cursor_column is not None:
            cursor_values = [
                row.get(config.cursor_column)
                for row in rows
                if isinstance(row.get(config.cursor_column), str)
                and row.get(config.cursor_column)
            ]
            if not cursor_values:
                raise PostgrestError(
                    f"{config.name} returned no usable {config.cursor_column} cursor"
                )
            page_watermark = max(cursor_values)
            next_watermark = max(
                value
                for value in (next_watermark, page_watermark)
                if value is not None
            )

        page_number += 1
        if len(rows) < page_size:
            break

    if (
        config.cursor_column is not None
        and next_watermark is not None
        and next_watermark != previous_watermark
    ):
        write_watermark(table, config, next_watermark, clock())

    return ViewResult(row_count, tuple(files), next_watermark)


def build_manifest(
    *,
    run_id: str,
    views: Mapping[str, ViewResult],
    started_at: datetime,
    finished_at: datetime,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "views": {
            name: {"rows": result.rows, "files": list(result.files)}
            for name, result in views.items()
        },
        "started_at": format_timestamp(started_at),
        "finished_at": format_timestamp(finished_at),
    }


def resolve_run_id(event: Mapping[str, Any] | None) -> tuple[str, bool]:
    event = event or {}
    on_demand = event.get("mode") == "on_demand"
    supplied = event.get("run_id")
    if on_demand:
        if not isinstance(supplied, str) or not supplied.strip():
            raise ValueError("on_demand extraction requires a non-empty run_id")
        return supplied, True
    return str(uuid.uuid4()), False


def run_extraction(
    *,
    event: Mapping[str, Any] | None,
    base_url: str,
    analytics_jwt: str,
    api_key: str,
    bucket: str,
    glue_job_name: str,
    http_client: HttpClient,
    s3_client: S3Client,
    table: DynamoTable,
    glue_client: GlueClient,
    clock: Callable[[], datetime] = utc_now,
    sleeper: Callable[[float], None] = time.sleep,
    view_configs: Sequence[ViewConfig] = VIEW_CONFIGS,
    page_size: int = PAGE_SIZE,
) -> ExtractionResult:
    """Run all views, publish one manifest, and start Glue exactly once."""

    run_id, on_demand = resolve_run_id(event)
    started_at = clock()
    extraction_date = started_at.astimezone(timezone.utc).date().isoformat()

    if on_demand:
        write_run_status(table, run_id, "extracting", started_at)

    view_results: dict[str, ViewResult] = {}
    for config in view_configs:
        view_results[config.name] = extract_view(
            config=config,
            extraction_date=extraction_date,
            base_url=base_url,
            analytics_jwt=analytics_jwt,
            api_key=api_key,
            bucket=bucket,
            http_client=http_client,
            s3_client=s3_client,
            table=table,
            clock=clock,
            sleeper=sleeper,
            page_size=page_size,
        )

    finished_at = clock()
    manifest = build_manifest(
        run_id=run_id,
        views=view_results,
        started_at=started_at,
        finished_at=finished_at,
    )
    manifest_key = f"raw/_manifests/dt={extraction_date}/manifest.json"
    s3_client.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=json.dumps(manifest, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
    )

    glue_response = glue_client.start_job_run(
        JobName=glue_job_name,
        Arguments={"--run_id": run_id, "--manifest_key": manifest_key},
    )
    glue_job_run_id = glue_response.get("JobRunId")
    if not isinstance(glue_job_run_id, str):
        glue_job_run_id = None

    if on_demand:
        status_details = {"manifest_key": manifest_key}
        if glue_job_run_id is not None:
            status_details["glue_job_run_id"] = glue_job_run_id
        write_run_status(
            table,
            run_id,
            "transform_started",
            finished_at,
            **status_details,
        )

    return ExtractionResult(run_id, manifest_key, manifest, glue_job_run_id)
