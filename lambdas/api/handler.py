"""Optional single-function router for all dashboard API proxy routes."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

try:
    import cloud_monitoring
    import metrics
    import runs
    from api_core import ApiError, error_response, json_response, request_method
except ImportError:
    from . import cloud_monitoring, metrics, runs
    from .api_core import ApiError, error_response, json_response, request_method


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    event = event or {}
    if request_method(event) == "OPTIONS":
        return json_response(200, {})
    path = event.get("resource") or event.get("rawPath") or event.get("path") or ""
    if not isinstance(path, str):
        return error_response(ApiError("route not found", 404))
    if path.startswith("/metrics/") or path == "/metrics/{metric}":
        return metrics.handler(event, context)
    if path.startswith("/runs"):
        return runs.handler(event, context)
    if path == "/cloud-monitoring":
        return cloud_monitoring.handler(event, context)
    return error_response(ApiError("route not found", 404))
