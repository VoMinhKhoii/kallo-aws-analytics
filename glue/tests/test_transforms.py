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
    app_health,
    compute_aggregates,
    feature_adoption,
    ingredient_demand,
    ingredient_gaps,
    ingredient_mappings,
    ingredient_rank_distribution,
    implausible_foods,
    journey_transitions,
    match_rate,
    pipeline_meal_conversion,
    product_funnel,
    product_retention,
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


def test_fixture_golden_meal_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    non_empty_buckets = [
        row for row in aggregates["macro_distributions"] if row["count"]
    ]
    assert {row["date"] for row in non_empty_buckets} == {
        "2026-08-08",
        "2026-08-09",
        "2026-08-10",
    }
    assert len(non_empty_buckets) == 12
    assert len(aggregates["macro_distributions"]) == 93
    assert all(row["count"] == 1 for row in non_empty_buckets)


def test_fixture_golden_ai_and_matching_aggregates() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert aggregates["ai_latency"] == [
        {
            "date": "2026-08-09",
            "model": "gemini-2.5-pro",
            "call_count": 1,
            "p50_ms": 5270,
            "p95_ms": 5270,
            "p99_ms": 5270,
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
            "ingredient_count": 3,
            "unaccounted_count": 0,
            "match_rate": 1.0,
        },
        {
            "date": "2026-08-09",
            "matched_count": 4,
            "unmatched_count": 1,
            "ingredient_count": 5,
            "unaccounted_count": 0,
            "match_rate": 0.8,
        },
        {
            "date": "2026-08-10",
            "matched_count": 2,
            "unmatched_count": 0,
            "ingredient_count": 2,
            "unaccounted_count": 0,
            "match_rate": 1.0,
        },
    ]


def test_fixture_golden_food_plausibility_aggregate() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert aggregates["implausible_foods"] == []


def test_only_operational_metrics_are_wired_from_sanitized_views() -> None:
    aggregates = compute_aggregates(all_fixture_rows())
    assert tuple(aggregates) == AGGREGATE_NAMES
    assert isinstance(aggregates["app_health"], list)
    assert {
        "retention_cohorts",
        "meal_volume",
        "top_foods",
        "onboarding_funnel",
        "coverage_gaps",
        "product_funnel",
        "product_retention",
        "journey_transitions",
        "feature_adoption",
        "pipeline_meal_conversion",
    }.isdisjoint(aggregates)


def test_ingredient_intelligence_metrics_are_wired_and_privacy_safe() -> None:
    decisions = fixture_rows("v_ingredient_decisions")
    aggregates = compute_aggregates(all_fixture_rows())

    assert aggregates["ingredient_demand"] == [
        {"date": "2026-08-08", "rank": 1, "ingredient_query": "unknown spice", "count": 1},
        {"date": "2026-08-09", "rank": 1, "ingredient_query": "mystery herb", "count": 1},
        {"date": "2026-08-10", "rank": 1, "ingredient_query": "chicken breast", "count": 2},
    ]
    assert aggregates["ingredient_gaps"] == [
        {
            "date": "2026-08-08",
            "rank": 1,
            "ingredient_query": "unknown spice",
            "verdict": "rejected",
            "reject_bucket": "no_candidates",
            "count": 1,
        },
        {
            "date": "2026-08-09",
            "rank": 2,
            "ingredient_query": "mystery herb",
            "verdict": "unmatched",
            "reject_bucket": "unmatched",
            "count": 1,
        },
    ]
    assert aggregates["ingredient_rank_distribution"] == [
        {"date": "2026-08-10", "pool_size": 1, "selected_rank": 1, "count": 1, "share": 1.0},
        {"date": "2026-08-10", "pool_size": 3, "selected_rank": 2, "count": 1, "share": 1.0},
    ]
    assert aggregates["corpus_reverse_lookup"] == [
        {
            "date": "2026-08-10",
            "rank": 1,
            "food_id": "VNFC-002",
            "food_name": "Chicken breast",
            "source": "USDA",
            "decision_count": 2,
            "query_count": 1,
            "query_examples": ["chicken breast"],
        }
    ]

    mappings = ingredient_mappings(decisions)
    chicken_mapping = next(
        row for row in mappings if row["ingredient_query"] == "chicken breast"
    )
    assert chicken_mapping["date"] == "2026-08-10"
    assert chicken_mapping["decision_count"] == 2
    assert chicken_mapping["chosen"] == {
        "food_id": "VNFC-002",
        "name": "Chicken breast",
        "source": "USDA",
        "similarity": 0.94,
    }
    assert chicken_mapping["candidates"]
    assert all(
        key not in {"decision_key", "request_id", "user_hash", "session_hash"}
        for metric in (
            aggregates["ingredient_demand"],
            aggregates["ingredient_gaps"],
            aggregates["ingredient_rank_distribution"],
            aggregates["corpus_reverse_lookup"],
            mappings,
        )
        for key in metric[0]
    )


def test_ingredient_metrics_cap_and_ignore_invalid_or_nonaccepted_rows() -> None:
    rows = [
        {
            "ingredient_query": "  Rice   noodles ",
            "verdict": "accepted",
            "pool_size": 2,
            "selected_rank": 1,
            "candidate_1_food_id": "food-1",
            "candidate_1_name": "Rice noodles",
            "candidate_1_source": "USDA",
            "candidate_1_similarity": 0.9,
            "chosen_food_id": "food-1",
            "chosen_name": "Rice noodles",
            "chosen_source": "USDA",
            "chosen_similarity": 0.9,
        },
        {
            "ingredient_query": "rice noodles",
            "verdict": "unmatched",
            "reject_bucket": "unmatched",
            "pool_size": 2,
            "selected_rank": None,
        },
        {
            "ingredient_query": "not-a-valid-query-" + "x" * 200,
            "verdict": "accepted",
        },
        {
            "ingredient_query": "ignored accepted invalid rank",
            "verdict": "accepted",
            "pool_size": 1,
            "selected_rank": 2,
        },
    ]

    assert ingredient_demand(rows, limit=1) == [
        {"rank": 1, "ingredient_query": "rice noodles", "count": 2}
    ]
    assert ingredient_gaps(rows) == [
        {
            "rank": 1,
            "ingredient_query": "rice noodles",
            "verdict": "unmatched",
            "reject_bucket": "unmatched",
            "count": 1,
        }
    ]
    assert ingredient_rank_distribution(rows) == [
        {"pool_size": 2, "selected_rank": 1, "count": 1, "share": 1.0}
    ]


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


def test_match_rate_denominator_counts_every_ingredient_the_run_saw() -> None:
    """A run can report ingredients that are neither matched nor unmatched.

    Production's 2026-08-22 snapshot had 918 matched + 103 unmatched against an
    ingredient_count of 1039. Dividing by the sum reports 89.9%; dividing by the
    population reports 88.4%. The 18-ingredient gap must stay visible.
    """

    rows = [
        {
            "created_at": "2026-08-10T03:00:00Z",
            "matched_count": 918,
            "unmatched_count": 103,
            "ingredient_count": 1039,
        }
    ]

    assert match_rate(rows) == [
        {
            "date": "2026-08-10",
            "matched_count": 918,
            "unmatched_count": 103,
            "ingredient_count": 1039,
            "unaccounted_count": 18,
            "match_rate": 0.883542,
        }
    ]


def _event(
    event_id: str,
    occurred_at: str,
    event_name: str,
    *,
    actor_hash: str | None = "actor-a",
    anonymous_hash: str | None = None,
    session_hash: str | None = None,
    **fields: Any,
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "occurred_at": occurred_at,
        "actor_hash": actor_hash,
        "anonymous_hash": anonymous_hash,
        "session_hash": session_hash,
        "event_name": event_name,
        **fields,
    }


def test_product_funnel_stitches_anonymous_bridge_and_requires_order() -> None:
    events = [
        _event(
            "e01",
            "2026-08-01T00:00:00Z",
            "app_opened",
            actor_hash="anon-a",
            anonymous_hash="anon-a",
        ),
        _event(
            "e02",
            "2026-08-01T01:00:00Z",
            "signup_started",
            actor_hash="user-a",
            anonymous_hash="anon-a",
            signup_method="google",
        ),
        _event(
            "e03",
            "2026-08-01T02:00:00Z",
            "signup_completed",
            actor_hash="user-a",
            anonymous_hash="anon-a",
            signup_method="google",
        ),
        _event(
            "e04",
            "2026-08-01T03:00:00Z",
            "onboarding_step_completed",
            actor_hash="user-a",
            onboarding_step=0,
        ),
        _event(
            "e05",
            "2026-08-01T04:00:00Z",
            "onboarding_step_completed",
            actor_hash="user-a",
            onboarding_step=1,
        ),
        _event(
            "e06",
            "2026-08-01T05:00:00Z",
            "onboarding_step_completed",
            actor_hash="user-a",
            onboarding_step=2,
        ),
        _event(
            "e07",
            "2026-08-01T06:00:00Z",
            "onboarding_step_completed",
            actor_hash="user-a",
            onboarding_step=3,
        ),
        _event(
            "e08",
            "2026-08-01T07:00:00Z",
            "onboarding_completed",
            actor_hash="user-a",
        ),
        _event(
            "e09",
            "2026-08-01T08:00:00Z",
            "meal_saved",
            actor_hash="user-a",
        ),
        _event(
            "e10",
            "2026-08-01T00:30:00Z",
            "app_opened",
            actor_hash="user-b",
        ),
        _event(
            "e11",
            "2026-08-01T01:30:00Z",
            "signup_started",
            actor_hash="user-b",
            signup_method="email",
        ),
    ]

    assert product_funnel(events) == [
        {
            "stage": "app_opened",
            "count": 2,
            "prior_conversion": None,
            "start_conversion": 1.0,
            "dropoff": 0,
        },
        {
            "stage": "signup_started",
            "count": 2,
            "prior_conversion": 1.0,
            "start_conversion": 1.0,
            "dropoff": 0,
        },
        {
            "stage": "signup_completed",
            "count": 1,
            "prior_conversion": 0.5,
            "start_conversion": 0.5,
            "dropoff": 1,
        },
        *[
            {
                "stage": stage,
                "count": 1,
                "prior_conversion": 1.0,
                "start_conversion": 0.5,
                "dropoff": 0,
            }
            for stage in (
                "onboarding_step_0_completed",
                "onboarding_step_1_completed",
                "onboarding_step_2_completed",
                "onboarding_step_3_completed",
                "onboarding_completed",
                "first_meal_saved",
            )
        ],
    ]


def test_product_retention_uses_eligible_denominators_and_exact_week_periods() -> None:
    events = [
        _event("u1", "2026-01-01T00:00:00Z", "meal_saved", actor_hash="user-a"),
        _event("u2", "2026-01-02T00:00:00Z", "meal_saved", actor_hash="user-a"),
        _event("u3", "2026-01-08T00:00:00Z", "meal_saved", actor_hash="user-a"),
        _event("u4", "2026-02-01T00:00:00Z", "meal_saved", actor_hash="user-a"),
        _event("v1", "2026-01-31T00:00:00Z", "meal_saved", actor_hash="user-b"),
    ]

    result = product_retention(events)
    assert result["milestones"] == [
        {
            "period": "D1",
            "days": 1,
            "eligible_users": 2,
            "returning_users": 1,
            "return_rate": 0.5,
        },
        {
            "period": "D7",
            "days": 7,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
        {
            "period": "D30",
            "days": 30,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
    ]
    assert result["weekly_cohorts"] == [
        {
            "cohort_week": "2025-12-29",
            "weeks_later": 0,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
        {
            "cohort_week": "2025-12-29",
            "weeks_later": 1,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
        {
            "cohort_week": "2025-12-29",
            "weeks_later": 2,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 0,
            "return_rate": 0.0,
        },
        {
            "cohort_week": "2025-12-29",
            "weeks_later": 3,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 0,
            "return_rate": 0.0,
        },
        {
            "cohort_week": "2025-12-29",
            "weeks_later": 4,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
        {
            "cohort_week": "2026-01-26",
            "weeks_later": 0,
            "cohort_size": 1,
            "eligible_users": 1,
            "returning_users": 1,
            "return_rate": 1.0,
        },
    ]


def test_journey_transitions_use_session_or_actor_and_drop_self_edges() -> None:
    events = [
        _event(
            "t1",
            "2026-08-01T00:00:00Z",
            "app_opened",
            actor_hash="user-a",
            session_hash="session-a",
        ),
        _event(
            "t2",
            "2026-08-01T01:00:00Z",
            "screen_viewed",
            actor_hash="user-a",
            session_hash="session-a",
            screen_key="home",
        ),
        _event(
            "t3",
            "2026-08-01T02:00:00Z",
            "screen_viewed",
            actor_hash="user-a",
            session_hash="session-a",
            screen_key="home",
        ),
        _event(
            "t4",
            "2026-08-01T03:00:00Z",
            "feature_viewed",
            actor_hash="user-a",
            session_hash="session-a",
            feature_key="dashboard",
        ),
        _event(
            "t5",
            "2026-08-02T00:00:00Z",
            "signup_started",
            actor_hash="user-b",
            signup_method="google",
        ),
        _event(
            "t6",
            "2026-08-02T01:00:00Z",
            "signup_completed",
            actor_hash="user-b",
            signup_method="google",
        ),
    ]

    transitions = journey_transitions(events)
    assert transitions == [
        {
            "rank": 1,
            "from_event": "app_opened",
            "to_event": "screen_viewed:home",
            "count": 1,
            "share": 0.333333,
        },
        {
            "rank": 2,
            "from_event": "screen_viewed:home",
            "to_event": "feature_viewed:dashboard",
            "count": 1,
            "share": 0.333333,
        },
        {
            "rank": 3,
            "from_event": "signup_started:google",
            "to_event": "signup_completed:google",
            "count": 1,
            "share": 0.333333,
        },
    ]
    assert all("event_id" not in row and "session_hash" not in row for row in transitions)


def test_feature_adoption_compares_exposed_groups_and_entry_modes() -> None:
    product_events = [
        _event(
            "f1",
            "2026-08-01T00:00:00Z",
            "feature_viewed",
            actor_hash="user-a",
            feature_key="ai_analysis",
        ),
        _event(
            "f2",
            "2026-08-01T01:00:00Z",
            "feature_used",
            actor_hash="user-a",
            feature_key="ai_analysis",
        ),
        _event(
            "f3",
            "2026-08-01T00:00:00Z",
            "feature_viewed",
            actor_hash="user-b",
            feature_key="ai_analysis",
        ),
        _event(
            "f4",
            "2026-08-02T00:00:00Z",
            "feature_adopted",
            actor_hash="user-a",
            feature_key="dashboard",
        ),
    ]
    meals = [
        {"user_hash": "user-a", "logged_at": "2026-08-02T00:00:00Z", "entry_mode": "precise"},
        {"user_hash": "user-a", "logged_at": "2026-08-03T00:00:00Z", "entry_mode": "precise"},
        {"user_hash": "user-b", "logged_at": "2026-07-31T00:00:00Z", "entry_mode": "manual"},
    ]

    result = feature_adoption(product_events, meals)
    assert result["features"] == [
        {
            "feature": "ai_analysis",
            "adopter_count": 1,
            "adopter_returning_users": 1,
            "adopter_retention_rate": 1.0,
            "non_adopter_count": 1,
            "non_adopter_returning_users": 0,
            "non_adopter_retention_rate": 0.0,
        },
        {
            "feature": "dashboard",
            "adopter_count": 1,
            "adopter_returning_users": 1,
            "adopter_retention_rate": 1.0,
            "non_adopter_count": 0,
            "non_adopter_returning_users": 0,
            "non_adopter_retention_rate": 0.0,
        },
    ]
    assert result["entry_modes"] == [
        {
            "entry_mode": "manual",
            "user_count": 1,
            "meal_count": 1,
            "later_meal_users": 0,
            "later_meal_rate": 0.0,
        },
        {
            "entry_mode": "precise",
            "user_count": 1,
            "meal_count": 2,
            "later_meal_users": 1,
            "later_meal_rate": 1.0,
        },
    ]
    assert "descriptive" in result["definition"]


def test_app_health_buckets_utc_and_calculates_duration_percentiles() -> None:
    rows = [
        {
            "event_id": "h1",
            "occurred_at": "2026-08-01T00:01:00+07:00",
            "platform": "web",
            "event_name": "api_request_failed",
            "route": "telemetry_ingest",
            "status_code": 503,
            "duration_ms": None,
        },
        {
            "event_id": "h2",
            "occurred_at": "2026-08-01T00:02:00+07:00",
            "platform": "web",
            "event_name": "api_request_failed",
            "route": "telemetry_ingest",
            "status_code": 500,
            "duration_ms": None,
        },
        {
            "event_id": "h3",
            "occurred_at": "2026-08-01T00:03:00+07:00",
            "platform": "web",
            "event_name": "performance_measured",
            "metric": "api_request",
            "duration_ms": 100,
        },
        {
            "event_id": "h4",
            "occurred_at": "2026-08-01T00:04:00+07:00",
            "platform": "web",
            "event_name": "performance_measured",
            "metric": "api_request",
            "duration_ms": 300,
        },
        {
            "event_id": "h5",
            "occurred_at": "2026-08-01T00:05:00+07:00",
            "platform": "ios",
            "event_name": "app_crashed",
            "fatal": True,
        },
    ]

    assert app_health(rows) == [
        {
            "hour": "2026-07-31T17:00:00Z",
            "platform": "ios",
            "event_name": "app_crashed",
            "dimension": "fatal",
            "dimension_value": "true",
            "count": 1,
            "p50_ms": None,
            "p95_ms": None,
        },
        {
            "hour": "2026-07-31T17:00:00Z",
            "platform": "web",
            "event_name": "api_request_failed",
            "dimension": "route",
            "dimension_value": "telemetry_ingest",
            "count": 2,
            "p50_ms": None,
            "p95_ms": None,
        },
        {
            "hour": "2026-07-31T17:00:00Z",
            "platform": "web",
            "event_name": "performance_measured",
            "dimension": "metric",
            "dimension_value": "api_request",
            "count": 2,
            "p50_ms": 200,
            "p95_ms": 290,
        },
    ]


def test_pipeline_meal_conversion_counts_requests_not_multiple_meals() -> None:
    runs = [
        {"id": "request-a", "created_at": "2026-08-01T01:00:00Z"},
        {"id": "request-b", "created_at": "2026-08-01T02:00:00Z"},
        {"id": "request-c", "created_at": "2026-08-02T01:00:00Z"},
    ]
    pipeline_meals = [
        {
            "meal_id": "meal-a-second-materialization",
            "pipeline_request_id": "request-a",
            "user_hash": "user-a",
            "logged_at": "2026-08-01T05:00:00Z",
            "entry_mode": "precise",
        },
        {
            "meal_id": "meal-a",
            "pipeline_request_id": "request-a",
            "user_hash": "user-a",
            "logged_at": "2026-08-01T05:00:00Z",
            "entry_mode": "precise",
        },
        {
            "meal_id": "meal-c",
            "pipeline_request_id": "request-c",
            "user_hash": "user-c",
            "logged_at": "2026-08-03T05:00:00Z",
            "entry_mode": "cheat",
        },
        {
            "meal_id": "meal-unknown",
            "pipeline_request_id": "request-unknown",
            "user_hash": "user-x",
            "logged_at": "2026-08-01T05:00:00Z",
            "entry_mode": "precise",
        },
    ]

    assert pipeline_meal_conversion(runs, pipeline_meals) == [
        {
            "date": "2026-08-01",
            "pipeline_request_count": 2,
            "converted_request_count": 1,
            "save_rate": 0.5,
        },
        {
            "date": "2026-08-02",
            "pipeline_request_count": 1,
            "converted_request_count": 1,
            "save_rate": 1.0,
        },
    ]
    assert all(
        row["save_rate"] <= 1
        for row in pipeline_meal_conversion(runs, pipeline_meals)
    )
