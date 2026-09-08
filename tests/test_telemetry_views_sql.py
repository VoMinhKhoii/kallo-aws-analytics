import re
from pathlib import Path

import pytest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260830021049_telemetry_analytics_views.sql"
)

VIEW_COLUMNS = {
    "v_product_events": [
        "event_id",
        "occurred_at",
        "actor_hash",
        "anonymous_hash",
        "session_hash",
        "platform",
        "app_version",
        "locale",
        "event_name",
        "cold_start",
        "screen_key",
        "signup_method",
        "analysis_mode",
        "has_references",
        "duration_ms",
        "retryable",
        "entry_mode",
        "edit_count",
        "onboarding_step",
        "feature_key",
        "feedback_type",
    ],
    "v_app_health": [
        "event_id",
        "occurred_at",
        "actor_hash",
        "platform",
        "app_version",
        "event_name",
        "route",
        "metric",
        "check",
        "status_code",
        "duration_ms",
        "fatal",
    ],
    "v_pipeline_meals": [
        "meal_id",
        "pipeline_request_id",
        "user_hash",
        "logged_at",
        "entry_mode",
    ],
}


@pytest.fixture(scope="module")
def migration_sql() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def _select_list(sql: str, view_name: str) -> str:
    pattern = re.compile(
        rf"CREATE\s+OR\s+REPLACE\s+VIEW\s+analytics\.{view_name}\s+"
        rf"WITH\s*\(\s*security_invoker\s*=\s*false\s*\)\s+AS\s+"
        rf"SELECT\s+(?P<select>.*?)\s+FROM\s+public\.",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(sql)
    assert match is not None, f"missing CREATE OR REPLACE VIEW for {view_name}"
    return match.group("select")


def _top_level_select_items(select_list: str) -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    in_single_quote = False

    for index, character in enumerate(select_list):
        if character == "'":
            # SQL escapes a quote in a string as two consecutive quotes.
            if index + 1 < len(select_list) and select_list[index + 1] == "'":
                continue
            in_single_quote = not in_single_quote
            continue
        if in_single_quote:
            continue
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        elif character == "," and depth == 0:
            items.append(select_list[start:index].strip())
            start = index + 1

    items.append(select_list[start:].strip())
    return items


def _output_column(select_item: str) -> str:
    alias_match = re.search(r"\s+AS\s+([a-z_][a-z0-9_]*)\s*$", select_item, re.I)
    if alias_match:
        return alias_match.group(1).lower()

    column_match = re.fullmatch(
        r"[a-z_][a-z0-9_]*\.([a-z_][a-z0-9_]*)", select_item, re.I
    )
    assert column_match is not None, f"cannot determine output column: {select_item}"
    return column_match.group(1).lower()


def test_new_views_are_the_only_views_in_the_append_only_migration(
    migration_sql: str,
) -> None:
    found = re.findall(
        r"CREATE\s+OR\s+REPLACE\s+VIEW\s+analytics\.([a-z_][a-z0-9_]*)",
        migration_sql,
        flags=re.IGNORECASE,
    )
    assert found == list(VIEW_COLUMNS)


@pytest.mark.parametrize(("view_name", "allowlist"), VIEW_COLUMNS.items())
def test_new_view_selects_have_exact_allowlists(
    migration_sql: str, view_name: str, allowlist: list[str]
) -> None:
    select_list = _select_list(migration_sql, view_name)
    projected_columns = [
        _output_column(item) for item in _top_level_select_items(select_list)
    ]
    assert projected_columns == allowlist


def test_product_event_identity_is_hmac_only_and_properties_are_flattened(
    migration_sql: str,
) -> None:
    product_select = _select_list(migration_sql, "v_product_events")
    assert "hmac(" in product_select.lower()
    assert "analytics.pepper" in product_select
    assert "hmac(p.user_id::text" in product_select
    assert "'anonymous:' || p.anonymous_id" in product_select
    assert "'session:' || p.session_id" in product_select
    assert re.search(
        r"WHEN\s+p\.anonymous_id\s+IS\s+NOT\s+NULL\s+AND\s+p\.consent\s+IS\s+TRUE"
        r".*?END\s+AS\s+anonymous_hash",
        product_select,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert "properties->>" in product_select
    projected = set(
        _output_column(item) for item in _top_level_select_items(product_select)
    )
    assert projected.isdisjoint(
        {
            "user_id",
            "anonymous_id",
            "session_id",
            "properties",
            "received_at",
            "email",
            "raw_input",
            "stack",
        }
    )


def test_product_events_exclude_health_events_and_apply_rolling_cutoff(
    migration_sql: str,
) -> None:
    product_definition = migration_sql.split(
        "COMMENT ON VIEW analytics.v_product_events", 1
    )[0]
    for health_event in (
        "api_request_failed",
        "app_crashed",
        "performance_measured",
        "health_check_failed",
    ):
        assert f"'{health_event}'" not in product_definition
    assert product_definition.count("now() - interval '90 days'") == 1
    assert migration_sql.count("now() - interval '90 days'") == 3


def test_health_events_are_closed_and_route_is_a_stable_key(
    migration_sql: str,
) -> None:
    health_select = _select_list(migration_sql, "v_app_health")
    assert "p.event_name IN (" in migration_sql
    assert "api_request_failed" in migration_sql
    assert "app_crashed" in migration_sql
    assert "performance_measured" in migration_sql
    assert "health_check_failed" in migration_sql
    assert "p.properties->>'route' ~ '^[a-z][a-z0-9_]{0,63}$'" in health_select
    assert "p.properties->>'metric' IN (" in health_select
    assert "p.properties->>'check' IN (" in health_select
    assert "p.properties->>'statusCode' ~ '^[45][0-9]{2}$'" in health_select


def test_pipeline_meal_view_checks_request_ownership_and_truncates_time(
    migration_sql: str,
) -> None:
    correlation_select = _select_list(migration_sql, "v_pipeline_meals")
    assert "date_trunc('hour', m.logged_at)" in correlation_select
    assert "INNER JOIN public.pipeline_requests AS pr" in migration_sql
    assert "pr.user_id = m.user_id" in migration_sql
    assert "WHERE m.pipeline_request_id IS NOT NULL" in migration_sql
    assert "raw_input" not in correlation_select.lower()


def test_new_views_have_restricted_reader_boundary(migration_sql: str) -> None:
    assert re.search(
        r"REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE.*?FROM\s+PUBLIC",
        migration_sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert re.search(
        r"GRANT\s+SELECT\s+ON\s+TABLE.*?TO\s+analytics_reader",
        migration_sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
