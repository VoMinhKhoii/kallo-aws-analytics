from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


GLUE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "lambdas" / "extract" / "tests" / "fixtures"
sys.path.insert(0, str(GLUE_DIR))

from transforms import (  # noqa: E402
    AGGREGATE_NAMES,
    compute_aggregates,
    implausible_foods,
)


def fixture_rows(view_name: str) -> list[dict[str, Any]]:
    path = FIXTURES / f"sample_{view_name}.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def all_fixture_rows() -> dict[str, list[dict[str, Any]]]:
    return {
        path.stem.removeprefix("sample_"): [
            json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
        ]
        for path in FIXTURES.glob("sample_*.jsonl")
    }


def test_fixture_golden_engagement_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert tuple(aggregates) == AGGREGATE_NAMES
    assert aggregates["dau_wau"] == [
        {"date": "2026-08-08", "dau": 1, "wau": 1},
        {"date": "2026-08-09", "dau": 1, "wau": 2},
        {"date": "2026-08-10", "dau": 1, "wau": 3},
    ]
    assert aggregates["retention_cohorts"] == [
        {
            "cohort_week": "2026-07-27",
            "weeks_later": 0,
            "cohort_size": 1,
            "active_users": 0,
            "retention_rate": 0.0,
        },
        {
            "cohort_week": "2026-07-27",
            "weeks_later": 1,
            "cohort_size": 1,
            "active_users": 1,
            "retention_rate": 1.0,
        },
        {
            "cohort_week": "2026-07-27",
            "weeks_later": 2,
            "cohort_size": 1,
            "active_users": 0,
            "retention_rate": 0.0,
        },
        {
            "cohort_week": "2026-08-03",
            "weeks_later": 0,
            "cohort_size": 2,
            "active_users": 1,
            "retention_rate": 0.5,
        },
        {
            "cohort_week": "2026-08-03",
            "weeks_later": 1,
            "cohort_size": 2,
            "active_users": 1,
            "retention_rate": 0.5,
        },
    ]


def test_fixture_golden_meal_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert aggregates["meal_volume"] == [
        {
            "date": "2026-08-08",
            "meal_slot": "breakfast",
            "entry_mode": "photo",
            "count": 1,
        },
        {
            "date": "2026-08-09",
            "meal_slot": "lunch",
            "entry_mode": "text",
            "count": 1,
        },
        {
            "date": "2026-08-10",
            "meal_slot": "snack",
            "entry_mode": "barcode",
            "count": 1,
        },
    ]
    assert aggregates["top_foods"] == [
        {"rank": 1, "ingredient_name": "Bánh mì trứng", "count": 1},
        {"rank": 2, "ingredient_name": "Cá kho tộ", "count": 1},
        {"rank": 3, "ingredient_name": "Cơm trắng", "count": 1},
    ]

    non_empty_buckets = [
        row for row in aggregates["macro_distributions"] if row["count"]
    ]
    assert non_empty_buckets == [
        {"nutrient": "calories_kcal", "bucket_min": 100, "bucket_max": 200, "count": 1},
        {"nutrient": "calories_kcal", "bucket_min": 400, "bucket_max": 500, "count": 1},
        {"nutrient": "calories_kcal", "bucket_min": 500, "bucket_max": 750, "count": 1},
        {"nutrient": "protein_g", "bucket_min": 0, "bucket_max": 10, "count": 1},
        {"nutrient": "protein_g", "bucket_min": 20, "bucket_max": 30, "count": 1},
        {"nutrient": "protein_g", "bucket_min": 30, "bucket_max": 40, "count": 1},
        {"nutrient": "carbohydrate_g", "bucket_min": 20, "bucket_max": 30, "count": 1},
        {"nutrient": "carbohydrate_g", "bucket_min": 50, "bucket_max": 75, "count": 1},
        {"nutrient": "carbohydrate_g", "bucket_min": 75, "bucket_max": 100, "count": 1},
        {"nutrient": "fat_g", "bucket_min": 5, "bucket_max": 10, "count": 1},
        {"nutrient": "fat_g", "bucket_min": 10, "bucket_max": 15, "count": 1},
        {"nutrient": "fat_g", "bucket_min": 20, "bucket_max": 30, "count": 1},
    ]
    assert len(aggregates["macro_distributions"]) == 31


def test_fixture_golden_ai_and_matching_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert aggregates["ai_latency"] == [
        {
            "date": "2026-08-09",
            "model": "gemini-2.5-pro",
            "call_count": 1,
            "p50_ms": 5270,
            "p95_ms": 5270,
        }
    ]
    assert aggregates["ai_failure_rate"] == [
        {
            "date": "2026-08-08",
            "provider": "google",
            "model": "gemini-2.5-flash",
            "event_count": 1,
            "failure_count": 0,
            "failure_rate": 0.0,
        },
        {
            "date": "2026-08-09",
            "provider": "google",
            "model": "gemini-2.5-pro",
            "event_count": 1,
            "failure_count": 0,
            "failure_rate": 0.0,
        },
        {
            "date": "2026-08-10",
            "provider": "google",
            "model": "gemini-2.5-flash",
            "event_count": 1,
            "failure_count": 1,
            "failure_rate": 1.0,
        },
    ]
    assert aggregates["token_cost_daily"] == [
        {
            "date": "2026-08-08",
            "model": "gemini-2.5-flash",
            "input_tokens": 842,
            "output_tokens": 216,
            "cost_usd": 0.0007926,
            "pricing_known": True,
        },
        {
            "date": "2026-08-09",
            "model": "gemini-2.5-pro",
            "input_tokens": 1210,
            "output_tokens": 388,
            "cost_usd": 0.0053925,
            "pricing_known": True,
        },
        {
            "date": "2026-08-10",
            "model": "gemini-2.5-flash",
            "input_tokens": 703,
            "output_tokens": 0,
            "cost_usd": 0.0002109,
            "pricing_known": True,
        },
    ]
    assert aggregates["match_rate"] == [
        {
            "date": "2026-08-08",
            "matched_count": 3,
            "unmatched_count": 0,
            "total_count": 3,
            "match_rate": 1.0,
        },
        {
            "date": "2026-08-09",
            "matched_count": 4,
            "unmatched_count": 1,
            "total_count": 5,
            "match_rate": 0.8,
        },
        {
            "date": "2026-08-10",
            "matched_count": 2,
            "unmatched_count": 0,
            "total_count": 2,
            "match_rate": 1.0,
        },
    ]


def test_fixture_golden_funnel_and_coverage_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert aggregates["onboarding_funnel"] == {
        "total_users": 3,
        "completed_users": 1,
        "completion_share": 0.333333,
        "steps": [
            {"step": 0, "user_count": 3, "share_of_started": 1.0},
            {"step": 1, "user_count": 3, "share_of_started": 1.0},
            {"step": 2, "user_count": 2, "share_of_started": 0.666667},
            {"step": 3, "user_count": 1, "share_of_started": 0.333333},
        ],
    }
    assert aggregates["coverage_gaps"] == [
        {"rank": 1, "query_text": "bánh canh cua chay", "count": 1},
        {"rank": 2, "query_text": "gỏi bưởi tôm khô", "count": 1},
        {"rank": 3, "query_text": "sữa hạt sen nhà làm", "count": 1},
    ]
    assert aggregates["implausible_foods"] == []


def test_implausible_foods_apply_only_the_three_spec_rules() -> None:
    fixture = fixture_rows("v_food_composition")[0]
    rows = [
        {
            **fixture,
            "id": "zero",
            "name_en": "Zero macros",
            "protein_g": 0,
            "carbohydrate_g": 0,
            "fat_g": 0,
        },
        {
            **fixture,
            "id": "staple",
            "name_en": "Broken rice",
            "protein_g": 30,
            "carbohydrate_g": 0,
            "fat_g": 2,
            "calories_kcal": 140,
        },
        {
            **fixture,
            "id": "mismatch",
            "name_en": "Mismatch",
            "type_en": "Fruit",
            "protein_g": 1,
            "carbohydrate_g": 1,
            "fat_g": 1,
            "calories_kcal": 100,
        },
        fixture,
    ]
    anomalies = {row["id"]: row for row in implausible_foods(rows)}
    assert set(anomalies) == {"zero", "staple", "mismatch"}
    assert anomalies["zero"]["reasons"] == [
        "kcal_positive_all_macros_zero",
        "carb_staple_zero_carbohydrate",
        "macro_calorie_mismatch_over_40_percent",
    ]
    assert anomalies["staple"]["reasons"] == ["carb_staple_zero_carbohydrate"]
    assert anomalies["mismatch"]["reasons"] == [
        "macro_calorie_mismatch_over_40_percent"
    ]
