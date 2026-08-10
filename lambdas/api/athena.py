"""Fixed-template asynchronous Athena query Lambda entrypoint."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

try:
    from api_core import (
        ApiError,
        error_response,
        json_response,
        parse_json_body,
        path_parameter,
        request_method,
        validate_date_range,
        validate_query_id,
    )
except ImportError:
    from .api_core import (
        ApiError,
        error_response,
        json_response,
        parse_json_body,
        path_parameter,
        request_method,
        validate_date_range,
        validate_query_id,
    )


# These are the only SQL statements the public API can start. User input is
# inserted only after strict YYYY-MM-DD validation and is always a DATE literal.
ATHENA_SQL_TEMPLATES: dict[str, str] = {
    "macro_distribution_range": """
SELECT
  CAST(logged_at AS DATE) AS meal_date,
  approx_percentile(CAST(calories_kcal AS DOUBLE), ARRAY[0.25, 0.5, 0.75, 0.95]) AS calories_kcal_percentiles,
  approx_percentile(CAST(protein_g AS DOUBLE), ARRAY[0.25, 0.5, 0.75, 0.95]) AS protein_g_percentiles,
  approx_percentile(CAST(carbohydrate_g AS DOUBLE), ARRAY[0.25, 0.5, 0.75, 0.95]) AS carbohydrate_g_percentiles,
  approx_percentile(CAST(fat_g AS DOUBLE), ARRAY[0.25, 0.5, 0.75, 0.95]) AS fat_g_percentiles
FROM v_meals
WHERE CAST(logged_at AS DATE) BETWEEN DATE '{from_date}' AND DATE '{to_date}'
GROUP BY 1
ORDER BY 1
""".strip(),
    "meals_by_locale_range": """
SELECT
  CAST(m.logged_at AS DATE) AS meal_date,
  COALESCE(u.preferred_locale, 'unknown') AS preferred_locale,
  COUNT(*) AS meal_count
FROM v_meals AS m
LEFT JOIN (
  SELECT user_hash, arbitrary(preferred_locale) AS preferred_locale
  FROM v_user_funnel
  GROUP BY user_hash
) AS u ON m.user_hash = u.user_hash
WHERE CAST(m.logged_at AS DATE) BETWEEN DATE '{from_date}' AND DATE '{to_date}'
GROUP BY 1, 2
ORDER BY 1, 2
""".strip(),
    "latency_percentiles_range": """
SELECT
  CAST(created_at AS DATE) AS run_date,
  COALESCE(model_call2, 'unknown') AS model,
  approx_percentile(CAST(total_ms AS DOUBLE), 0.50) AS p50_ms,
  approx_percentile(CAST(total_ms AS DOUBLE), 0.95) AS p95_ms,
  COUNT(*) AS run_count
FROM v_pipeline_runs
WHERE CAST(created_at AS DATE) BETWEEN DATE '{from_date}' AND DATE '{to_date}'
GROUP BY 1, 2
ORDER BY 1, 2
""".strip(),
}


def render_athena_query(template_id: Any, from_value: Any, to_value: Any) -> str:
    if not isinstance(template_id, str) or template_id not in ATHENA_SQL_TEMPLATES:
        raise ApiError("template_id is not supported")
    from_date, to_date = validate_date_range(from_value, to_value)
    return ATHENA_SQL_TEMPLATES[template_id].format(
        from_date=from_date, to_date=to_date
    )


def start_query(
    athena_client: Any,
    *,
    sql: str,
    workgroup: str,
    database: str,
    output: str,
) -> str:
    response = athena_client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": database},
        ResultConfiguration={"OutputLocation": output},
        WorkGroup=workgroup,
    )
    query_id = response.get("QueryExecutionId")
    if not isinstance(query_id, str) or not query_id:
        raise RuntimeError("Athena did not return a query execution id")
    return query_id


def query_status(athena_client: Any, query_id: str) -> dict[str, Any]:
    response = athena_client.get_query_execution(QueryExecutionId=query_id)
    execution = response.get("QueryExecution")
    if not isinstance(execution, Mapping):
        raise RuntimeError("Athena returned no query execution")
    status = execution.get("Status")
    status = status if isinstance(status, Mapping) else {}
    state = status.get("State")
    if not isinstance(state, str):
        raise RuntimeError("Athena returned no query state")

    result: dict[str, Any] = {
        "query_execution_id": query_id,
        "status": state,
    }
    reason = status.get("StateChangeReason")
    if isinstance(reason, str) and reason:
        result["state_change_reason"] = reason
    if "Statistics" in execution:
        result["statistics"] = execution["Statistics"]

    if state == "SUCCEEDED":
        page = athena_client.get_query_results(
            QueryExecutionId=query_id,
            MaxResults=100,
        )
        result_set = page.get("ResultSet")
        result_set = result_set if isinstance(result_set, Mapping) else {}
        metadata = result_set.get("ResultSetMetadata")
        metadata = metadata if isinstance(metadata, Mapping) else {}
        columns = metadata.get("ColumnInfo")
        result["columns"] = columns if isinstance(columns, list) else []
        rows = result_set.get("Rows")
        result["rows"] = rows if isinstance(rows, list) else []
    return result


def handle(
    event: Mapping[str, Any],
    athena_client: Any,
    *,
    workgroup: str,
    database: str,
    output: str,
) -> dict[str, Any]:
    try:
        method = request_method(event)
        raw_query_id = path_parameter(event, "query_id", "id")
        if method == "POST" and raw_query_id is None:
            body = parse_json_body(event)
            sql = render_athena_query(
                body.get("template_id"), body.get("from"), body.get("to")
            )
            query_id = start_query(
                athena_client,
                sql=sql,
                workgroup=workgroup,
                database=database,
                output=output,
            )
            return json_response(202, {"query_execution_id": query_id})
        if method == "GET" and raw_query_id is not None:
            query_id = validate_query_id(raw_query_id)
            return json_response(200, query_status(athena_client, query_id))
        raise ApiError("method not allowed", 405)
    except Exception as error:
        return error_response(error)


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    import boto3

    workgroup = os.environ.get("ATHENA_WORKGROUP")
    database = os.environ.get("ATHENA_DATABASE")
    output = os.environ.get("ATHENA_OUTPUT")
    if not all((workgroup, database, output)):
        return error_response(RuntimeError("Athena environment is incomplete"))
    return handle(
        event or {},
        boto3.client("athena"),
        workgroup=workgroup,
        database=database,
        output=output,
    )

