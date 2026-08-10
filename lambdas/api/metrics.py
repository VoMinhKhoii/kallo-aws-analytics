"""GET /metrics/{metric} Lambda entrypoint."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

try:
    from api_core import (
        ApiError,
        error_response,
        json_response,
        path_parameter,
        query_metric_range,
        query_parameters,
        request_method,
        validate_date_range,
        validate_metric,
    )
except ImportError:
    from .api_core import (
        ApiError,
        error_response,
        json_response,
        path_parameter,
        query_metric_range,
        query_parameters,
        request_method,
        validate_date_range,
        validate_metric,
    )


def handle(event: Mapping[str, Any], table: Any) -> dict[str, Any]:
    try:
        if request_method(event) != "GET":
            raise ApiError("method not allowed", 405)
        metric = validate_metric(path_parameter(event, "metric"))
        parameters = query_parameters(event)
        from_date, to_date = validate_date_range(
            parameters.get("from"), parameters.get("to")
        )
        items = query_metric_range(table, metric, from_date, to_date)
        return json_response(
            200,
            {
                "metric": metric,
                "from": from_date,
                "to": to_date,
                "items": items,
            },
        )
    except Exception as error:
        return error_response(error)


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    import boto3

    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        return error_response(RuntimeError("TABLE_NAME is not set"))
    return handle(event or {}, boto3.resource("dynamodb").Table(table_name))

