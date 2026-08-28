"""POST /runs and GET /runs/{run_id} Lambda entrypoint."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from datetime import datetime, timezone
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
) -> dict[str, Any]:
    try:
        method = request_method(event)
        raw_run_id = path_parameter(event, "run_id", "id")
        if method == "POST" and raw_run_id is None:
            if lambda_client is None or not function_name or table is None:
                raise RuntimeError("run start dependencies are not configured")
            run_id = str(run_id_factory())
            # Claim the run id BEFORE the asynchronous invoke. The extract
            # Lambda writes its own first status seconds later, so without this
            # the dashboard's first poll races it and reads a hard 404.
            record_run_phase(table, run_id, "queued")
            try:
                start_run(lambda_client, function_name, run_id)
            except Exception:
                record_run_phase(table, run_id, "failed", failure_reason="start_failed")
                raise
            return json_response(202, {"run_id": run_id})
        if method == "GET" and raw_run_id is not None:
            if table is None:
                raise RuntimeError("run polling dependencies are not configured")
            run_id = validate_run_id(raw_run_id)
            record = get_run_record(table, run_id)
            if record is None:
                raise ApiError("run not found", 404)
            return json_response(200, record)
        raise ApiError("method not allowed", 405)
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

