from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260909071000_supabase_24h_range.sql"
)


def test_supabase_ranges_include_latest_utc_day() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "when '24h' then analytics.anchor_date()" in sql
    for value in ("'7d'", "'30d'", "'90d'"):
        assert f"when {value}" in sql
