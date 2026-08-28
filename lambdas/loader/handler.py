"""Lambda entrypoint for loading successful Glue aggregates into DynamoDB."""

from __future__ import annotations

import os
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

try:  # Lambda ZIPs place both modules at the archive root.
    from loader_core import (
        FAILED_GLUE_STATES,
        event_run_id,
        glue_event_state,
        load_aggregates,
        mark_run_failed,
        resolve_load_context,
    )
except ImportError:  # Tests import this file as ``lambdas.loader.handler``.
    from .loader_core import (
        FAILED_GLUE_STATES,
        event_run_id,
        glue_event_state,
        load_aggregates,
        mark_run_failed,
        resolve_load_context,
    )


def _required_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise RuntimeError(f"required environment variable {' or '.join(names)} is not set")


def _utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    """Load a successful Glue run's aggregates, or record its terminal failure."""

    import boto3

    event = event or {}
    bucket = _required_env("BUCKET", "BUCKET_NAME")
    table_name = _required_env("TABLE_NAME")
    s3_client = boto3.client("s3")
    glue_client = boto3.client("glue")
    table = boto3.resource("dynamodb").Table(table_name)

    state = glue_event_state(event)
    if state in FAILED_GLUE_STATES:
        run_id = event_run_id(event, glue_client)
        if run_id:
            mark_run_failed(
                table=table,
                run_id=run_id,
                failure_reason=f"glue_{state.lower()}",
                updated_at=_utc_now_text(),
            )
        return {"run_id": run_id, "phase": "failed", "failure_reason": state}

    load_context = resolve_load_context(
        event=event,
        default_bucket=bucket,
        s3_client=s3_client,
        glue_client=glue_client,
    )
    try:
        result = load_aggregates(
            table=table,
            s3_client=s3_client,
            context=load_context,
        )
    except Exception as error:
        # The Glue job succeeded but the aggregates are unusable. Without this
        # the run polls at "transform_started" until the browser gives up.
        mark_run_failed(
            table=table,
            run_id=load_context.run_id,
            failure_reason=type(error).__name__,
            updated_at=_utc_now_text(),
        )
        raise
    return {
        "run_id": result.run_id,
        "date": result.date,
        "phase": "completed",
        "metrics": list(result.metrics),
    }
