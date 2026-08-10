"""Lambda entrypoint for loading successful Glue aggregates into DynamoDB."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

try:  # Lambda ZIPs place both modules at the archive root.
    from loader_core import load_aggregates, resolve_load_context
except ImportError:  # Tests import this file as ``lambdas.loader.handler``.
    from .loader_core import load_aggregates, resolve_load_context


def _required_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise RuntimeError(f"required environment variable {' or '.join(names)} is not set")


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    """Load all aggregates for the manifest belonging to a successful Glue run."""

    import boto3

    event = event or {}
    bucket = _required_env("BUCKET", "BUCKET_NAME")
    table_name = _required_env("TABLE_NAME")
    s3_client = boto3.client("s3")
    glue_client = boto3.client("glue")
    load_context = resolve_load_context(
        event=event,
        default_bucket=bucket,
        s3_client=s3_client,
        glue_client=glue_client,
    )
    result = load_aggregates(
        table=boto3.resource("dynamodb").Table(table_name),
        s3_client=s3_client,
        context=load_context,
    )
    return {
        "run_id": result.run_id,
        "date": result.date,
        "phase": "completed",
        "metrics": list(result.metrics),
    }
