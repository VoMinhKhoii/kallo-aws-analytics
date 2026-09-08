from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260905090000_reduce_to_operational_analytics.sql"
)


def test_reduction_migration_retires_behavior_views_and_functions() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    for function_name in ("analytics_summary", "analytics_weeks"):
        assert f"drop function if exists public.{function_name}" in sql

    for view_name in (
        "v_product_events",
        "v_pipeline_meals",
        "v_user_funnel",
        "v_meal_items",
        "v_unmatched_ingredients",
    ):
        assert f"drop view if exists analytics.{view_name}" in sql


def test_reduced_app_health_view_excludes_actor_and_diagnostic_payloads() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    select_body = sql.split("create view analytics.v_app_health", 1)[1].split(
        "from public.product_telemetry_events", 1
    )[0]

    for forbidden in ("actor_hash", "anonymous_hash", "session_hash", "error_message", "stack_trace"):
        assert forbidden not in select_body
    for required in ("event_id", "occurred_at", "platform", "event_name", "duration_ms"):
        assert required in select_body
