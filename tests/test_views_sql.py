import re
from pathlib import Path

import pytest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "0001_analytics_schema.sql"
)

VIEW_COLUMNS = {
    "v_pipeline_runs": [
        "id",
        "created_at",
        "pipeline_version",
        "model_call1",
        "model_call2",
        "total_ms",
        "ingredient_count",
        "matched_count",
        "unmatched_count",
        "retry_count",
        "escalated",
        "cache_hit_l4",
    ],
    "v_budget_events": [
        "id",
        "created_at",
        "request_id",
        "route",
        "work_kind",
        "provider",
        "model",
        "request_count",
        "input_tokens",
        "output_tokens",
        "error_category",
    ],
    "v_meals": [
        "id",
        "user_hash",
        "logged_at",
        "meal_slot",
        "entry_mode",
        "confidence_overall",
        "calories_kcal",
        "protein_g",
        "carbohydrate_g",
        "fat_g",
        "fiber_g",
    ],
    "v_meal_items": [
        "id",
        "meal_id",
        "ingredient_name",
        "food_composition_id",
        "estimated_grams",
        "match_confidence",
        "cooking_method",
        "created_at",
    ],
    "v_unmatched_ingredients": ["id", "query_text", "created_at"],
    "v_user_funnel": [
        "user_hash",
        "created_at",
        "onboarding_step",
        "onboarding_completed_at",
        "goal",
        "preferred_locale",
    ],
    "v_food_composition": [
        "id",
        "name_en",
        "type_en",
        "state",
        "source_id",
        "serving_size_g",
        "calories_kcal",
        "protein_g",
        "carbohydrate_g",
        "fat_g",
        "fiber_g",
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

    for index, character in enumerate(select_list):
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


def test_all_and_only_expected_views_exist(migration_sql: str) -> None:
    found = re.findall(
        r"CREATE\s+OR\s+REPLACE\s+VIEW\s+analytics\.([a-z_][a-z0-9_]*)",
        migration_sql,
        flags=re.IGNORECASE,
    )
    assert set(found) == set(VIEW_COLUMNS)
    assert len(found) == len(VIEW_COLUMNS)


@pytest.mark.parametrize(("view_name", "allowlist"), VIEW_COLUMNS.items())
def test_view_select_has_exact_allowlist(
    migration_sql: str, view_name: str, allowlist: list[str]
) -> None:
    select_list = _select_list(migration_sql, view_name)
    projected_columns = [
        _output_column(item) for item in _top_level_select_items(select_list)
    ]
    assert projected_columns == allowlist


@pytest.mark.parametrize(
    "forbidden_pattern",
    [r"raw_input", r"email", r"service_role", r"SELECT\s+\*"],
)
def test_migration_omits_forbidden_strings(
    migration_sql: str, forbidden_pattern: str
) -> None:
    assert re.search(forbidden_pattern, migration_sql, flags=re.IGNORECASE) is None
