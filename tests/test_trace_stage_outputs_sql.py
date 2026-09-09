from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260909071500_trace_stage_outputs.sql"
)


def test_trace_stage_outputs_are_bounded_and_recursively_sanitized() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "analytics.sanitize_trace_output" in sql
    assert "p_depth >= 7" in sql
    assert "item.ordinality <= 50" in sql
    assert "left(p_value #>> '{}', 1000)" in sql
    for forbidden_key in (
        "prompt",
        "response.?raw",
        "raw.?response",
        "user.?id",
        "session.?id",
        "actor.?id",
        "request.?context",
        "authorization",
        "email",
    ):
        assert forbidden_key in sql


def test_trace_detail_only_exports_known_structured_stage_types() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    stage_output = sql.split("'stageoutputs'", 1)[1].split("'counts'", 1)[0]

    assert "analytics.sanitize_trace_output(output_json)" in stage_output
    assert "stage in ('decomposition', 'matching', 'nutrition', 'assembly')" in stage_output
    assert "'output', output_json" not in stage_output
