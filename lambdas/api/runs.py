"""POST /runs and GET /runs/{run_id} Lambda entrypoint."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Mapping
from datetime import datetime, timezone
from math import ceil
from typing import Any
from uuid import uuid4

try:
    from api_core import (
        ApiError,
        error_response,
        get_run_record,
        json_response,
        path_parameter,
        request_method,
        validate_run_id,
    )
except ImportError:
    from .api_core import (
        ApiError,
        error_response,
        get_run_record,
        json_response,
        path_parameter,
        request_method,
        validate_run_id,
    )


def _utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# Run records use the ``_run#<uuid>`` metric prefix.  A different prefix keeps
# this exact-key guard item permanently separate from every run record, even
# if a future run-id generator changes its format.
RUN_GUARD_METRIC = "_run_guard#pipeline"
RUN_GUARD_DATE = "latest"
RUN_GUARD_SECONDS = 30 * 60


def _utc_text_from_epoch(value: float) -> str:
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def _conditional_check_failed(error: BaseException) -> bool:
    """Recognise DynamoDB's conditional-write failure without importing boto3."""

    response = getattr(error, "response", None)
    if isinstance(response, Mapping):
        details = response.get("Error")
        if isinstance(details, Mapping) and details.get("Code") == "ConditionalCheckFailedException":
            return True
    return error.__class__.__name__ == "ConditionalCheckFailedException"


def _epoch_value(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result and result != float("inf") and result != float("-inf") else None


class RunGuardBusy(ApiError):
    """A clean 429 response for a server-authoritative run cooldown."""

    def __init__(self, next_allowed_epoch: float, now_epoch: float) -> None:
        self.next_allowed_epoch = next_allowed_epoch
        self.retry_after = max(1, int(ceil(max(0.0, next_allowed_epoch - now_epoch))))
        super().__init__(
            "an analytics snapshot is already running or was started recently",
            429,
        )


def claim_run_guard(
    table: Any,
    run_id: str,
    *,
    now_epoch: float | None = None,
    guard_seconds: int = RUN_GUARD_SECONDS,
) -> float:
    """Atomically reserve the single shared pipeline run slot.

    The exact-key conditional put is the concurrency boundary.  A second
    dashboard, tab, or device cannot pass this guard just because its local
    UI state is fresh.  The 30-minute horizon is longer than the configured
    ten-minute Glue timeout and leaves room for extract/load hand-off.
    """

    # DynamoDB's resource serializer rejects binary floating-point values;
    # whole-second epochs are sufficient for this 30-minute safety horizon.
    now = int(time.time() if now_epoch is None else now_epoch)
    until = now + max(1, guard_seconds)
    item = {
        "metric": RUN_GUARD_METRIC,
        "date": RUN_GUARD_DATE,
        "owner_run_id": run_id,
        "phase": "claimed",
        "claimed_at": _utc_text_from_epoch(now),
        "guard_until": until,
    }
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(#metric) OR #guard_until <= :now",
            ExpressionAttributeNames={
                "#metric": "metric",
                "#guard_until": "guard_until",
            },
            ExpressionAttributeValues={":now": now},
        )
    except Exception as error:
        if not _conditional_check_failed(error):
            raise
        current = table.get_item(
            Key={"metric": RUN_GUARD_METRIC, "date": RUN_GUARD_DATE},
            ConsistentRead=True,
        ).get("Item")
        existing_until = _epoch_value(current.get("guard_until")) if isinstance(current, Mapping) else None
        raise RunGuardBusy(existing_until if existing_until and existing_until > now else until, now) from error
    return until


def release_run_guard(table: Any, run_id: str, *, now_epoch: float | None = None) -> None:
    """Shorten a claimed guard after an invoke/setup failure.

    The owner condition prevents a late failure from shortening a newer claim
    if the guard was already reclaimed after expiry.
    """

    now = int(time.time() if now_epoch is None else now_epoch)
    try:
        table.update_item(
            Key={"metric": RUN_GUARD_METRIC, "date": RUN_GUARD_DATE},
            UpdateExpression="SET #guard_until = :now, #phase = :phase, #released_at = :released_at",
            ConditionExpression="#owner_run_id = :run_id",
            ExpressionAttributeNames={
                "#guard_until": "guard_until",
                "#phase": "phase",
                "#released_at": "released_at",
                "#owner_run_id": "owner_run_id",
            },
            ExpressionAttributeValues={
                ":now": now,
                ":phase": "released",
                ":released_at": _utc_text_from_epoch(now),
                ":run_id": run_id,
            },
        )
    except Exception as error:
        # A conditional miss means another claim has already replaced this
        # guard.  It is safe to leave that newer claim untouched.
        if not _conditional_check_failed(error):
            raise


def record_run_phase(table: Any, run_id: str, phase: str, **details: str) -> None:
    """Write the run's status item so a poll immediately after POST resolves."""

    item = {
        "metric": f"_run#{run_id}",
        "date": "latest",
        "run_id": run_id,
        "phase": phase,
        "updated_at": _utc_now_text(),
    }
    item.update(details)
    table.put_item(Item=item)


def start_run(lambda_client: Any, function_name: str, run_id: str) -> None:
    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="Event",
        Payload=json.dumps(
            {"mode": "on_demand", "run_id": run_id}, separators=(",", ":")
        ).encode("utf-8"),
    )
    if response.get("StatusCode") != 202:
        raise RuntimeError("extract Lambda did not accept the asynchronous invocation")


def handle(
    event: Mapping[str, Any],
    *,
    table: Any | None = None,
    lambda_client: Any | None = None,
    function_name: str | None = None,
    run_id_factory: Any = uuid4,
    now_factory: Any = time.time,
) -> dict[str, Any]:
    try:
        method = request_method(event)
        raw_run_id = path_parameter(event, "run_id", "id")
        if method == "POST" and raw_run_id is None:
            if lambda_client is None or not function_name or table is None:
                raise RuntimeError("run start dependencies are not configured")
            run_id = str(run_id_factory())
            now_epoch = float(now_factory())
            guard_until = claim_run_guard(table, run_id, now_epoch=now_epoch)
            try:
                # Claim and status item both precede the asynchronous invoke.
                # The extract Lambda writes its own first status seconds later,
                # so without this the dashboard's first poll races a hard 404.
                record_run_phase(table, run_id, "queued")
                start_run(lambda_client, function_name, run_id)
            except Exception:
                release_run_guard(table, run_id, now_epoch=float(now_factory()))
                try:
                    record_run_phase(table, run_id, "failed", failure_reason="start_failed")
                except Exception:
                    # Preserve the original invoke/setup failure.  The guard
                    # has already been shortened so a retry remains possible.
                    pass
                raise
            return json_response(
                202,
                {
                    "run_id": run_id,
                    "next_allowed_at": _utc_text_from_epoch(guard_until),
                },
            )
        if method == "GET" and raw_run_id is not None:
            if table is None:
                raise RuntimeError("run polling dependencies are not configured")
            run_id = validate_run_id(raw_run_id)
            record = get_run_record(table, run_id)
            if record is None:
                raise ApiError("run not found", 404)
            return json_response(200, record)
        raise ApiError("method not allowed", 405)
    except RunGuardBusy as error:
        response = json_response(
            429,
            {
                "error": str(error),
                "retry_after": error.retry_after,
                "next_allowed_at": _utc_text_from_epoch(error.next_allowed_epoch),
            },
        )
        response["headers"]["Retry-After"] = str(error.retry_after)
        return response
    except Exception as error:
        return error_response(error)


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    import boto3

    event = event or {}
    method = request_method(event)
    function_name = os.environ.get("EXTRACT_FUNCTION_NAME")
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        return error_response(RuntimeError("TABLE_NAME is not set"))
    table = boto3.resource("dynamodb").Table(table_name)
    if method == "POST":
        if not function_name:
            return error_response(RuntimeError("EXTRACT_FUNCTION_NAME is not set"))
        return handle(
            event,
            table=table,
            lambda_client=boto3.client("lambda"),
            function_name=function_name,
        )
    return handle(event, table=table)
