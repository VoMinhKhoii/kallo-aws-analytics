import re
from pathlib import Path

import pytest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260830023432_ingredient_intelligence.sql"
)

VIEW_COLUMNS = [
    "decision_key",
    "occurred_on",
    "ingredient_query",
    "verdict",
    "pool_size",
    "selected_rank",
    "reject_bucket",
    "candidate_1_food_id",
    "candidate_1_name",
    "candidate_1_source",
    "candidate_1_similarity",
    "candidate_2_food_id",
    "candidate_2_name",
    "candidate_2_source",
    "candidate_2_similarity",
    "candidate_3_food_id",
    "candidate_3_name",
    "candidate_3_source",
    "candidate_3_similarity",
    "chosen_food_id",
    "chosen_name",
    "chosen_source",
    "chosen_similarity",
]


@pytest.fixture(scope="module")
def migration_sql() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def _select_list(sql: str) -> str:
    view_start = re.search(
        r"CREATE\s+OR\s+REPLACE\s+VIEW\s+analytics\.v_ingredient_decisions\b",
        sql,
        flags=re.IGNORECASE,
    )
    assert view_start is not None, "missing ingredient decision view definition"
    select_start = sql.index("SELECT\n    encode", view_start.end()) + len("SELECT\n")
    select_end = sql.index("\nFROM prepared;", select_start)
    return sql[select_start:select_end]


def _top_level_select_items(select_list: str) -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    in_single_quote = False
    index = 0
    while index < len(select_list):
        character = select_list[index]
        if character == "'":
            if index + 1 < len(select_list) and select_list[index + 1] == "'":
                index += 2
                continue
            in_single_quote = not in_single_quote
        elif not in_single_quote:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
            elif character == "," and depth == 0:
                items.append(select_list[start:index].strip())
                start = index + 1
        index += 1
    items.append(select_list[start:].strip())
    return items


def _output_column(select_item: str) -> str:
    alias_match = re.search(r"\s+AS\s+([a-z_][a-z0-9_]*)\s*$", select_item, re.I)
    if alias_match:
        return alias_match.group(1).lower()
    column_match = re.fullmatch(
        r"(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)", select_item, re.I
    )
    assert column_match is not None, f"cannot determine output column: {select_item}"
    return column_match.group(1).lower()


def test_migration_creates_exactly_the_ingredient_decision_view(
    migration_sql: str,
) -> None:
    found = re.findall(
        r"CREATE\s+OR\s+REPLACE\s+VIEW\s+analytics\.([a-z_][a-z0-9_]*)",
        migration_sql,
        flags=re.IGNORECASE,
    )
    assert found == ["v_ingredient_decisions"]
    projected = [
        _output_column(item) for item in _top_level_select_items(_select_list(migration_sql))
    ]
    assert projected == VIEW_COLUMNS


def test_decision_view_uses_opaque_keys_and_closed_scalar_fields(
    migration_sql: str,
) -> None:
    select_list = _select_list(migration_sql)
    assert "hmac(" in select_list.lower()
    assert "ingredient-decision:" in select_list
    assert "analytics.pepper" in select_list
    assert "cands -> 0" in migration_sql
    assert "cands -> 1" in migration_sql
    assert "cands -> 2" in migration_sql
    assert "THEN sel + 1" in select_list
    assert "reject_bucket" in select_list
    assert re.search(r"\bAS\s+reject_reason\b", select_list, re.I) is None
    assert re.search(r"\brequest_id\s+AS\b", select_list, re.I) is None
    assert re.search(r"\b(?:cands|output_json|raw_input|nutrition|properties)\s+AS\b", select_list, re.I) is None


def test_decision_view_closes_verdicts_rejects_and_rolling_cutoff(
    migration_sql: str,
) -> None:
    assert "vp.verdict IN ('accepted', 'unmatched', 'rejected', 'missing')" in migration_sql
    assert "now() - interval '90 days'" in migration_sql
    for bucket in (
        "unmatched",
        "missing",
        "no_candidates",
        "low_confidence",
        "invalid_input",
        "model_rejected",
        "other",
    ):
        assert f"'{bucket}'" in migration_sql


def test_decision_view_grants_only_the_restricted_reader(migration_sql: str) -> None:
    grants = re.findall(
        r"GRANT\s+[^;]+\s+TO\s+([^;]+);", migration_sql, flags=re.IGNORECASE
    )
    assert len(grants) == 1
    assert grants[0].strip().lower() == "analytics_reader"
    assert re.search(
        r"REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+analytics\.v_ingredient_decisions\s+"
        r"FROM\s+PUBLIC,\s+anon,\s+authenticated",
        migration_sql,
        flags=re.IGNORECASE,
    )
