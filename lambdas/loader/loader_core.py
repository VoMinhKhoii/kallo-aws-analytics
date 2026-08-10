"""Unit-testable aggregate loading and Glue-event resolution."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol
from urllib.parse import urlparse


MANIFEST_DATE = re.compile(r"(?:^|/)dt=(\d{4}-\d{2}-\d{2})(?:/|$)")
AGGREGATE_KEY = re.compile(
    r"^aggregates/dt=(\d{4}-\d{2}-\d{2})/([a-z][a-z0-9_]*)\.json$"
)


class S3Client(Protocol):
    def get_object(self, **kwargs: Any) -> Mapping[str, Any]: ...

    def list_objects_v2(self, **kwargs: Any) -> Mapping[str, Any]: ...


class GlueClient(Protocol):
    def get_job_run(self, **kwargs: Any) -> Mapping[str, Any]: ...


class DynamoTable(Protocol):
    def put_item(self, **kwargs: Any) -> Mapping[str, Any]: ...

    def update_item(self, **kwargs: Any) -> Mapping[str, Any]: ...


class LoaderError(RuntimeError):
    """Base error for invalid loader input or source objects."""


class MalformedAggregateError(LoaderError):
    """An aggregate object cannot safely be persisted."""


@dataclass(frozen=True)
class LoadContext:
    bucket: str
    manifest_key: str
    run_id: str
    date: str
    completed_at: str


@dataclass(frozen=True)
class LoadResult:
    run_id: str
    date: str
    metrics: tuple[str, ...]


def _read_body(response: Mapping[str, Any]) -> bytes:
    body = response.get("Body")
    if hasattr(body, "read"):
        body = body.read()
    if isinstance(body, str):
        return body.encode("utf-8")
    if isinstance(body, bytes):
        return body
    raise LoaderError("S3 object response has no readable Body")


def _read_json(s3_client: S3Client, bucket: str, key: str) -> Any:
    try:
        raw = _read_body(s3_client.get_object(Bucket=bucket, Key=key))
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LoaderError(f"S3 object is not valid UTF-8 JSON: {key}") from error


def _split_s3_reference(default_bucket: str, reference: str) -> tuple[str, str]:
    if not reference.startswith("s3://"):
        return default_bucket, reference.lstrip("/")
    parsed = urlparse(reference)
    if not parsed.netloc or not parsed.path.lstrip("/"):
        raise LoaderError(f"invalid S3 manifest reference: {reference}")
    return parsed.netloc, parsed.path.lstrip("/")


def _list_keys(s3_client: S3Client, bucket: str, prefix: str) -> list[str]:
    keys: list[str] = []
    continuation: str | None = None
    while True:
        arguments: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
        if continuation:
            arguments["ContinuationToken"] = continuation
        response = s3_client.list_objects_v2(**arguments)
        for item in response.get("Contents", []):
            if isinstance(item, Mapping) and isinstance(item.get("Key"), str):
                keys.append(item["Key"])
        if not response.get("IsTruncated"):
            return keys
        continuation = response.get("NextContinuationToken")
        if not isinstance(continuation, str) or not continuation:
            raise LoaderError("truncated S3 listing omitted NextContinuationToken")


def latest_manifest_key(s3_client: S3Client, bucket: str) -> str:
    keys = [
        key
        for key in _list_keys(s3_client, bucket, "raw/_manifests/dt=")
        if key.endswith("/manifest.json") and MANIFEST_DATE.search(key)
    ]
    if not keys:
        raise LoaderError("no manifest exists under raw/_manifests/")
    return max(keys, key=lambda key: (MANIFEST_DATE.search(key).group(1), key))  # type: ignore[union-attr]


def _event_arguments(event: Mapping[str, Any]) -> Mapping[str, Any]:
    detail = event.get("detail")
    detail = detail if isinstance(detail, Mapping) else {}
    candidates = (
        detail.get("arguments"),
        detail.get("Arguments"),
        event.get("arguments"),
        event.get("Arguments"),
    )
    for candidate in candidates:
        if isinstance(candidate, Mapping):
            return candidate
    return {}


def _glue_job_arguments(
    event: Mapping[str, Any], glue_client: GlueClient | None
) -> Mapping[str, Any]:
    arguments = _event_arguments(event)
    if arguments:
        return arguments
    if glue_client is None:
        return {}

    detail = event.get("detail")
    detail = detail if isinstance(detail, Mapping) else {}
    job_name = detail.get("jobName") or detail.get("job_name")
    run_id = (
        detail.get("jobRunId") or detail.get("jobRunID") or detail.get("job_run_id")
    )
    if not isinstance(job_name, str) or not isinstance(run_id, str):
        return {}
    response = glue_client.get_job_run(
        JobName=job_name,
        RunId=run_id,
        PredecessorsIncluded=False,
    )
    job_run = response.get("JobRun")
    if isinstance(job_run, Mapping) and isinstance(job_run.get("Arguments"), Mapping):
        return job_run["Arguments"]
    return {}


def resolve_load_context(
    *,
    event: Mapping[str, Any],
    default_bucket: str,
    s3_client: S3Client,
    glue_client: GlueClient | None = None,
) -> LoadContext:
    """Resolve run/date from Glue arguments, falling back to the latest manifest."""

    detail = event.get("detail")
    if isinstance(detail, Mapping):
        state = detail.get("state")
        if state is not None and state != "SUCCEEDED":
            raise LoaderError(
                f"loader only accepts SUCCEEDED Glue events, got {state!r}"
            )

    arguments = _glue_job_arguments(event, glue_client)
    manifest_reference = arguments.get("--manifest_key") or arguments.get("--manifest")
    argument_bucket = arguments.get("--bucket") or arguments.get("--source_bucket")
    bucket = (
        argument_bucket
        if isinstance(argument_bucket, str) and argument_bucket
        else default_bucket
    )
    if not isinstance(manifest_reference, str) or not manifest_reference:
        manifest_reference = latest_manifest_key(s3_client, bucket)
    bucket, manifest_key = _split_s3_reference(bucket, manifest_reference)

    manifest = _read_json(s3_client, bucket, manifest_key)
    if not isinstance(manifest, Mapping):
        raise LoaderError("manifest must be a JSON object")
    run_id = manifest.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise LoaderError("manifest has no non-empty run_id")
    argument_run_id = arguments.get("--run_id")
    if isinstance(argument_run_id, str) and argument_run_id != run_id:
        raise LoaderError("Glue --run_id does not match the manifest run_id")

    match = MANIFEST_DATE.search(manifest_key)
    if match:
        aggregate_date = match.group(1)
    else:
        started_at = manifest.get("started_at")
        if not isinstance(started_at, str):
            raise LoaderError("manifest reference and body do not identify a date")
        try:
            aggregate_date = (
                datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                .date()
                .isoformat()
            )
        except ValueError as error:
            raise LoaderError("manifest started_at is not an ISO timestamp") from error

    completed_at = manifest.get("finished_at")
    if not isinstance(completed_at, str) or not completed_at:
        completed_at = f"{aggregate_date}T00:00:00Z"
    return LoadContext(bucket, manifest_key, run_id, aggregate_date, completed_at)


def read_aggregate_payloads(
    s3_client: S3Client, bucket: str, aggregate_date: str
) -> dict[str, Any]:
    """Read and validate every aggregate before any DynamoDB mutation occurs."""

    prefix = f"aggregates/dt={aggregate_date}/"
    keys = sorted(
        key for key in _list_keys(s3_client, bucket, prefix) if key.endswith(".json")
    )
    if not keys:
        raise MalformedAggregateError(f"no aggregate JSON files found under {prefix}")

    payloads: dict[str, Any] = {}
    for key in keys:
        match = AGGREGATE_KEY.fullmatch(key)
        if not match or match.group(1) != aggregate_date:
            raise MalformedAggregateError(f"malformed aggregate object key: {key}")
        metric = match.group(2)
        try:
            payload = _read_json(s3_client, bucket, key)
        except LoaderError as error:
            raise MalformedAggregateError(str(error)) from error
        if not isinstance(payload, (dict, list)):
            raise MalformedAggregateError(
                f"aggregate payload must be a JSON object or array: {key}"
            )
        try:
            # Canonicalization both validates non-finite numbers and guarantees
            # an identical DynamoDB value when the same input is applied twice.
            json.dumps(payload, allow_nan=False)
        except (TypeError, ValueError) as error:
            raise MalformedAggregateError(
                f"invalid aggregate payload: {key}"
            ) from error
        if metric in payloads:
            raise MalformedAggregateError(f"duplicate aggregate metric: {metric}")
        payloads[metric] = payload
    return payloads


def apply_aggregate_payloads(
    *,
    table: DynamoTable,
    payloads: Mapping[str, Any],
    aggregate_date: str,
    run_id: str,
    manifest_key: str,
    completed_at: str,
) -> LoadResult:
    """Idempotently replace metric/date items, then mark the run completed."""

    metrics = tuple(sorted(payloads))
    for metric in metrics:
        canonical_payload = json.dumps(
            payloads[metric],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        table.put_item(
            Item={
                "metric": metric,
                "date": aggregate_date,
                "payload": canonical_payload,
            }
        )

    table.update_item(
        Key={"metric": f"_run#{run_id}", "date": "latest"},
        UpdateExpression=(
            "SET #phase = :completed, completed_at = :completed_at, "
            "updated_at = :completed_at, manifest_key = :manifest_key, "
            "run_id = :run_id"
        ),
        ExpressionAttributeNames={"#phase": "phase"},
        ExpressionAttributeValues={
            ":completed": "completed",
            ":completed_at": completed_at,
            ":manifest_key": manifest_key,
            ":run_id": run_id,
        },
    )
    return LoadResult(run_id, aggregate_date, metrics)


def load_aggregates(
    *, table: DynamoTable, s3_client: S3Client, context: LoadContext
) -> LoadResult:
    payloads = read_aggregate_payloads(s3_client, context.bucket, context.date)
    return apply_aggregate_payloads(
        table=table,
        payloads=payloads,
        aggregate_date=context.date,
        run_id=context.run_id,
        manifest_key=context.manifest_key,
        completed_at=context.completed_at,
    )
