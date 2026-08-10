"""Pure, deterministic transformations for the Kallo dashboard aggregates.

This module intentionally has no Spark or AWS imports.  Glue converts Spark
rows to ordinary dictionaries before calling these functions, which keeps the
business rules fast to test with pytest.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, timedelta, timezone
from typing import Any


Row = Mapping[str, Any]

# Fixed display buckets make successive daily histogram files comparable.  A
# null upper bound represents +infinity in JSON without emitting non-standard
# Infinity values.
MACRO_BUCKETS: dict[str, tuple[float, ...]] = {
    "calories_kcal": (0, 100, 200, 300, 400, 500, 750, 1_000),
    "protein_g": (0, 10, 20, 30, 40, 50, 75, 100),
    "carbohydrate_g": (0, 10, 20, 30, 40, 50, 75, 100),
    "fat_g": (0, 5, 10, 15, 20, 30, 50),
}

# Standard paid-tier text-token prices in USD per one million tokens.  The Pro
# <=200k prompt tier applies because a single meal-analysis request is far below
# that boundary.  Pricing data: [1] Google, "Gemini Developer API pricing,"
# https://ai.google.dev/gemini-api/docs/pricing (accessed Aug. 10, 2026).
MODEL_PRICES_USD_PER_MILLION: dict[str, dict[str, float]] = {
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
}

CARB_STAPLE_TYPE_TERMS: tuple[str, ...] = (
    "bread",
    "cereal",
    "grain",
    "noodle",
    "pasta",
    "rice",
    "starch",
    "starchy",
    "tuber",
)

AGGREGATE_NAMES: tuple[str, ...] = (
    "dau_wau",
    "retention_cohorts",
    "meal_volume",
    "macro_distributions",
    "top_foods",
    "ai_latency",
    "ai_failure_rate",
    "token_cost_daily",
    "match_rate",
    "onboarding_funnel",
    "coverage_gaps",
    "implausible_foods",
)


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _as_date(value: Any) -> date | None:
    parsed = _as_datetime(value)
    return parsed.astimezone(timezone.utc).date() if parsed else None


def _number(value: Any) -> float:
    if value is None or isinstance(value, bool):
        return 0.0
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _integer(value: Any) -> int:
    return int(_number(value))


def _ratio(numerator: int | float, denominator: int | float) -> float:
    return round(numerator / denominator, 6) if denominator else 0.0


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def dau_wau(meals: Sequence[Row]) -> list[dict[str, Any]]:
    """Daily active users and rolling seven-calendar-day active users.

    Engagement is defined exactly as the spec states: a user is active when
    they log at least one meal.
    """

    users_by_day: dict[date, set[str]] = defaultdict(set)
    for row in meals:
        day = _as_date(row.get("logged_at"))
        user = row.get("user_hash")
        if day and isinstance(user, str) and user:
            users_by_day[day].add(user)
    if not users_by_day:
        return []

    first_day, last_day = min(users_by_day), max(users_by_day)
    output: list[dict[str, Any]] = []
    day = first_day
    while day <= last_day:
        window_users: set[str] = set()
        for offset in range(7):
            window_users.update(users_by_day.get(day - timedelta(days=offset), set()))
        output.append(
            {
                "date": day.isoformat(),
                "dau": len(users_by_day.get(day, set())),
                "wau": len(window_users),
            }
        )
        day += timedelta(days=1)
    return output


def retention_cohorts(
    user_funnel: Sequence[Row], meals: Sequence[Row]
) -> list[dict[str, Any]]:
    """Build Monday-based signup cohorts and later-week meal activity."""

    cohort_by_user: dict[str, date] = {}
    for row in user_funnel:
        user = row.get("user_hash")
        created = _as_date(row.get("created_at"))
        if isinstance(user, str) and user and created:
            cohort = _week_start(created)
            existing = cohort_by_user.get(user)
            if existing is None or cohort < existing:
                cohort_by_user[user] = cohort

    cohort_users: dict[date, set[str]] = defaultdict(set)
    for user, cohort in cohort_by_user.items():
        cohort_users[cohort].add(user)

    active_by_cohort_week: dict[tuple[date, int], set[str]] = defaultdict(set)
    observed_dates: list[date] = []
    for row in meals:
        user = row.get("user_hash")
        active_day = _as_date(row.get("logged_at"))
        if not isinstance(user, str) or not active_day or user not in cohort_by_user:
            continue
        observed_dates.append(active_day)
        cohort = cohort_by_user[user]
        weeks_later = (_week_start(active_day) - cohort).days // 7
        if weeks_later >= 0:
            active_by_cohort_week[(cohort, weeks_later)].add(user)

    funnel_dates = [
        created
        for row in user_funnel
        if (created := _as_date(row.get("created_at"))) is not None
    ]
    latest_observed = max(observed_dates + funnel_dates, default=None)
    output: list[dict[str, Any]] = []
    for cohort in sorted(cohort_users):
        cohort_size = len(cohort_users[cohort])
        max_week = (
            max(0, (_week_start(latest_observed) - cohort).days // 7)
            if latest_observed
            else 0
        )
        for weeks_later in range(max_week + 1):
            active_users = len(active_by_cohort_week.get((cohort, weeks_later), set()))
            output.append(
                {
                    "cohort_week": cohort.isoformat(),
                    "weeks_later": weeks_later,
                    "cohort_size": cohort_size,
                    "active_users": active_users,
                    "retention_rate": _ratio(active_users, cohort_size),
                }
            )
    return output


def meal_volume(meals: Sequence[Row]) -> list[dict[str, Any]]:
    counts: Counter[tuple[str, str, str]] = Counter()
    for row in meals:
        day = _as_date(row.get("logged_at"))
        if day:
            counts[
                (
                    day.isoformat(),
                    str(row.get("meal_slot") or "unknown"),
                    str(row.get("entry_mode") or "unknown"),
                )
            ] += 1
    return [
        {"date": day, "meal_slot": slot, "entry_mode": mode, "count": count}
        for (day, slot, mode), count in sorted(counts.items())
    ]


def _histogram(
    values: Iterable[float], boundaries: Sequence[float]
) -> list[dict[str, Any]]:
    counts = [0] * len(boundaries)
    for value in values:
        if value < boundaries[0]:
            continue
        index = len(boundaries) - 1
        for candidate in range(len(boundaries) - 1):
            if boundaries[candidate] <= value < boundaries[candidate + 1]:
                index = candidate
                break
        counts[index] += 1
    return [
        {
            "bucket_min": boundary,
            "bucket_max": boundaries[index + 1]
            if index + 1 < len(boundaries)
            else None,
            "count": counts[index],
        }
        for index, boundary in enumerate(boundaries)
    ]


def macro_distributions(meals: Sequence[Row]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for nutrient, boundaries in MACRO_BUCKETS.items():
        values = [
            _number(row[nutrient]) for row in meals if row.get(nutrient) is not None
        ]
        for bucket in _histogram(values, boundaries):
            output.append({"nutrient": nutrient, **bucket})
    return output


def top_foods(meal_items: Sequence[Row], limit: int = 20) -> list[dict[str, Any]]:
    counts = Counter(
        name.strip()
        for row in meal_items
        if isinstance((name := row.get("ingredient_name")), str) and name.strip()
    )
    ranked = sorted(
        counts.items(), key=lambda item: (-item[1], item[0].casefold(), item[0])
    )[:limit]
    return [
        {"rank": rank, "ingredient_name": name, "count": count}
        for rank, (name, count) in enumerate(ranked, start=1)
    ]


def _percentile(values: Sequence[float], percentile: float) -> float | int:
    """Return a linearly interpolated percentile, matching common chart tools."""

    ordered = sorted(values)
    if not ordered:
        raise ValueError("a percentile requires at least one value")
    position = (len(ordered) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        result = ordered[lower]
    else:
        result = ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
    rounded = round(result, 3)
    return int(rounded) if rounded.is_integer() else rounded


def ai_latency(pipeline_runs: Sequence[Row]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in pipeline_runs:
        day = _as_date(row.get("created_at"))
        model = row.get("model_call2")
        total_ms = row.get("total_ms")
        if day and isinstance(model, str) and model and total_ms is not None:
            groups[(day.isoformat(), model)].append(_number(total_ms))
    return [
        {
            "date": day,
            "model": model,
            "call_count": len(values),
            "p50_ms": _percentile(values, 0.50),
            "p95_ms": _percentile(values, 0.95),
        }
        for (day, model), values in sorted(groups.items())
    ]


def ai_failure_rate(budget_events: Sequence[Row]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str], list[int]] = defaultdict(lambda: [0, 0])
    for row in budget_events:
        day = _as_date(row.get("created_at"))
        provider = row.get("provider")
        model = row.get("model")
        if not day or not isinstance(provider, str) or not isinstance(model, str):
            continue
        group = groups[(day.isoformat(), provider, model)]
        group[0] += 1
        if row.get("error_category") is not None:
            group[1] += 1
    return [
        {
            "date": day,
            "provider": provider,
            "model": model,
            "event_count": totals[0],
            "failure_count": totals[1],
            "failure_rate": _ratio(totals[1], totals[0]),
        }
        for (day, provider, model), totals in sorted(groups.items())
    ]


def token_cost_daily(budget_events: Sequence[Row]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for row in budget_events:
        day = _as_date(row.get("created_at"))
        model = row.get("model")
        if day and isinstance(model, str) and model:
            group = groups[(day.isoformat(), model)]
            group[0] += _integer(row.get("input_tokens"))
            group[1] += _integer(row.get("output_tokens"))

    output: list[dict[str, Any]] = []
    for (day, model), (input_tokens, output_tokens) in sorted(groups.items()):
        prices = MODEL_PRICES_USD_PER_MILLION.get(model)
        cost = (
            (input_tokens * prices["input"] + output_tokens * prices["output"])
            / 1_000_000
            if prices
            else 0.0
        )
        output.append(
            {
                "date": day,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(cost, 8),
                "pricing_known": prices is not None,
            }
        )
    return output


def match_rate(pipeline_runs: Sequence[Row]) -> list[dict[str, Any]]:
    groups: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in pipeline_runs:
        day = _as_date(row.get("created_at"))
        if day:
            group = groups[day.isoformat()]
            group[0] += _integer(row.get("matched_count"))
            group[1] += _integer(row.get("unmatched_count"))
    return [
        {
            "date": day,
            "matched_count": counts[0],
            "unmatched_count": counts[1],
            "total_count": counts[0] + counts[1],
            "match_rate": _ratio(counts[0], counts[0] + counts[1]),
        }
        for day, counts in sorted(groups.items())
    ]


def onboarding_funnel(user_funnel: Sequence[Row]) -> dict[str, Any]:
    # Keep only one (the furthest-progressed) source record per pseudonymous user.
    users: dict[str, dict[str, Any]] = {}
    for row in user_funnel:
        user = row.get("user_hash")
        if not isinstance(user, str) or not user:
            continue
        step = min(3, max(0, _integer(row.get("onboarding_step"))))
        current = users.get(user)
        completed = row.get("onboarding_completed_at") is not None
        if current is None or step > current["step"]:
            users[user] = {"step": step, "completed": completed}
        elif completed:
            current["completed"] = True

    total = len(users)
    steps = []
    for step in range(4):
        count = sum(user["step"] >= step for user in users.values())
        steps.append(
            {
                "step": step,
                "user_count": count,
                "share_of_started": _ratio(count, total),
            }
        )
    completed_users = sum(user["completed"] for user in users.values())
    return {
        "total_users": total,
        "completed_users": completed_users,
        "completion_share": _ratio(completed_users, total),
        "steps": steps,
    }


def coverage_gaps(
    unmatched_ingredients: Sequence[Row], limit: int = 30
) -> list[dict[str, Any]]:
    counts = Counter(
        query.strip()
        for row in unmatched_ingredients
        if isinstance((query := row.get("query_text")), str) and query.strip()
    )
    ranked = sorted(
        counts.items(), key=lambda item: (-item[1], item[0].casefold(), item[0])
    )[:limit]
    return [
        {"rank": rank, "query_text": query, "count": count}
        for rank, (query, count) in enumerate(ranked, start=1)
    ]


def _is_carb_staple(type_en: Any) -> bool:
    if not isinstance(type_en, str):
        return False
    normalized = type_en.casefold()
    return any(term in normalized for term in CARB_STAPLE_TYPE_TERMS)


def implausible_foods(food_composition: Sequence[Row]) -> list[dict[str, Any]]:
    """Return foods violating one or more of the spec's three exact rules."""

    output: list[dict[str, Any]] = []
    for row in food_composition:
        calories = _number(row.get("calories_kcal"))
        protein = _number(row.get("protein_g"))
        carbohydrate = _number(row.get("carbohydrate_g"))
        fat = _number(row.get("fat_g"))
        reasons: list[str] = []
        if calories > 0 and protein == 0 and carbohydrate == 0 and fat == 0:
            reasons.append("kcal_positive_all_macros_zero")
        if _is_carb_staple(row.get("type_en")) and carbohydrate == 0:
            reasons.append("carb_staple_zero_carbohydrate")
        macro_calories = 4 * protein + 4 * carbohydrate + 9 * fat
        mismatch_share = (
            abs(macro_calories - calories) / calories if calories > 0 else 0.0
        )
        if calories > 0 and mismatch_share > 0.4:
            reasons.append("macro_calorie_mismatch_over_40_percent")
        if reasons:
            output.append(
                {
                    "id": row.get("id"),
                    "name_en": row.get("name_en"),
                    "type_en": row.get("type_en"),
                    "calories_kcal": calories,
                    "protein_g": protein,
                    "carbohydrate_g": carbohydrate,
                    "fat_g": fat,
                    "macro_calories_kcal": round(macro_calories, 3),
                    "mismatch_share": round(mismatch_share, 6),
                    "reasons": reasons,
                }
            )
    return sorted(
        output,
        key=lambda row: (
            str(row.get("name_en") or "").casefold(),
            str(row.get("id") or ""),
        ),
    )


def compute_aggregates(rows_by_view: Mapping[str, Sequence[Row]]) -> dict[str, Any]:
    """Compute every DynamoDB-backed dashboard aggregate from view rows."""

    meals = rows_by_view.get("v_meals", ())
    pipeline_runs = rows_by_view.get("v_pipeline_runs", ())
    budget_events = rows_by_view.get("v_budget_events", ())
    user_funnel = rows_by_view.get("v_user_funnel", ())
    aggregates = {
        "dau_wau": dau_wau(meals),
        "retention_cohorts": retention_cohorts(user_funnel, meals),
        "meal_volume": meal_volume(meals),
        "macro_distributions": macro_distributions(meals),
        "top_foods": top_foods(rows_by_view.get("v_meal_items", ())),
        "ai_latency": ai_latency(pipeline_runs),
        "ai_failure_rate": ai_failure_rate(budget_events),
        "token_cost_daily": token_cost_daily(budget_events),
        "match_rate": match_rate(pipeline_runs),
        "onboarding_funnel": onboarding_funnel(user_funnel),
        "coverage_gaps": coverage_gaps(rows_by_view.get("v_unmatched_ingredients", ())),
        "implausible_foods": implausible_foods(
            rows_by_view.get("v_food_composition", ())
        ),
    }
    assert tuple(aggregates) == AGGREGATE_NAMES
    return aggregates
