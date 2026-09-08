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
    "macro_distributions",
    "ai_latency",
    "ai_failure_rate",
    "token_cost_daily",
    "match_rate",
    "implausible_foods",
    "app_health",
    "ingredient_demand",
    "ingredient_mappings",
    "corpus_reverse_lookup",
    "ingredient_gaps",
    "ingredient_rank_distribution",
)

INGREDIENT_METRIC_LIMIT = 50
INGREDIENT_QUERY_MAX_LENGTH = 160
CORPUS_QUERY_EXAMPLE_LIMIT = 5
INGREDIENT_REJECT_BUCKETS: frozenset[str] = frozenset(
    {
        "unmatched",
        "missing",
        "no_candidates",
        "low_confidence",
        "invalid_input",
        "model_rejected",
        "other",
    }
)

PRODUCT_EVENT_NAMES: frozenset[str] = frozenset(
    {
        "app_opened",
        "screen_viewed",
        "signup_started",
        "signup_completed",
        "meal_analysis_started",
        "meal_analysis_completed",
        "meal_analysis_failed",
        "meal_saved",
        "meal_discarded",
        "meal_edited",
        "onboarding_step_viewed",
        "onboarding_step_completed",
        "onboarding_completed",
        "feature_viewed",
        "feature_used",
        "feature_adopted",
        "feedback_submitted",
    }
)
CONTROLLED_FEATURE_KEYS: frozenset[str] = frozenset(
    {
        "meal_logging",
        "ai_analysis",
        "cheat_meals",
        "barcode_logging",
        "nutrition_label",
        "relog",
        "dashboard",
        "weight_tracking",
        "social_circle",
        "onboarding",
    }
)
CONTROLLED_ENTRY_MODES: frozenset[str] = frozenset(
    {
        "precise",
        "cheat",
        "manual",
        "barcode",
        "nutrition_label",
        "relog",
        # These values are present in the older v_meals source fixture.
        "photo",
        "text",
    }
)
JOURNEY_TRANSITION_LIMIT = 50
PRODUCT_FUNNEL_STAGES: tuple[str, ...] = (
    "app_opened",
    "signup_started",
    "signup_completed",
    "onboarding_step_0_completed",
    "onboarding_step_1_completed",
    "onboarding_step_2_completed",
    "onboarding_step_3_completed",
    "onboarding_completed",
    "first_meal_saved",
)
APP_HEALTH_EVENT_NAMES: frozenset[str] = frozenset(
    {
        "api_request_failed",
        "app_crashed",
        "performance_measured",
        "health_check_failed",
    }
)
HEALTH_METRIC_KEYS: frozenset[str] = frozenset(
    {"app_startup", "screen_render", "meal_analysis", "meal_save", "api_request"}
)
HEALTH_CHECK_KEYS: frozenset[str] = frozenset(
    {"api_reachable", "auth_session", "telemetry_ingest"}
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
    meals_by_day: dict[str, list[Row]] = defaultdict(list)
    for row in meals:
        day = _as_date(row.get("logged_at"))
        if day is not None:
            meals_by_day[day.isoformat()].append(row)
    for day in sorted(meals_by_day):
        for nutrient, boundaries in MACRO_BUCKETS.items():
            values = [
                _number(row[nutrient])
                for row in meals_by_day[day]
                if row.get(nutrient) is not None
            ]
            for bucket in _histogram(values, boundaries):
                output.append({"date": day, "nutrient": nutrient, **bucket})
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
            "p99_ms": _percentile(values, 0.99),
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
    """Match rate over every ingredient a run saw, not just the classified ones.

    ``matched_count + unmatched_count`` is NOT the population: some ingredients
    end up in neither bucket (18 of 1039 in the 2026-08-22 production snapshot),
    so dividing by the sum silently inflates the rate. ``ingredient_count`` is
    the run's own count of what it was asked to resolve, and the difference is
    published as ``unaccounted_count`` rather than being hidden in the ratio.
    """

    groups: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for row in pipeline_runs:
        day = _as_date(row.get("created_at"))
        if day:
            group = groups[day.isoformat()]
            group[0] += _integer(row.get("matched_count"))
            group[1] += _integer(row.get("unmatched_count"))
            group[2] += _integer(row.get("ingredient_count"))
    return [
        {
            "date": day,
            "matched_count": counts[0],
            "unmatched_count": counts[1],
            "ingredient_count": counts[2],
            "unaccounted_count": counts[2] - counts[0] - counts[1],
            "match_rate": _ratio(counts[0], counts[2]),
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


def _safe_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _stable_key(value: Any, *, max_length: int = 64) -> str | None:
    """Accept only the contract's lowercase stable-key shape."""

    value = _safe_text(value)
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    digits = "0123456789"
    if value is None or len(value) > max_length or value[0] not in alphabet:
        return None
    if not all(character in alphabet + digits + "_" for character in value):
        return None
    return value


def _identity_aliases(product_events: Sequence[Row]) -> dict[str, str]:
    """Resolve unambiguous anonymous-to-authenticated identity bridges."""

    candidates: dict[str, set[str]] = defaultdict(set)
    for row in product_events:
        anonymous = _safe_text(row.get("anonymous_hash"))
        actor = _safe_text(row.get("actor_hash"))
        # SQL uses actor_hash as the anonymous fallback, so equal hashes are
        # not an authenticated bridge.
        if anonymous and actor and anonymous != actor:
            candidates[anonymous].add(actor)
    return {
        anonymous: next(iter(actors))
        for anonymous, actors in candidates.items()
        if len(actors) == 1
    }


def _canonical_actor(row: Row, aliases: Mapping[str, str]) -> str | None:
    actor = _safe_text(row.get("actor_hash"))
    anonymous = _safe_text(row.get("anonymous_hash"))
    if actor:
        if anonymous and actor == anonymous:
            return aliases.get(anonymous, actor)
        return actor
    if anonymous:
        return aliases.get(anonymous, anonymous)
    return None


def _event_datetime(row: Row) -> datetime | None:
    return _as_datetime(row.get("occurred_at"))


def _event_sort_key(row: Row) -> tuple[datetime, str] | None:
    occurred_at = _event_datetime(row)
    event_id = _safe_text(row.get("event_id")) or ""
    return (occurred_at, event_id) if occurred_at else None


def _funnel_stage_matches(row: Row, stage: str) -> bool:
    event_name = row.get("event_name")
    if stage == "first_meal_saved":
        return event_name == "meal_saved"
    if stage.startswith("onboarding_step_"):
        return (
            event_name == "onboarding_step_completed"
            and _integer(row.get("onboarding_step"))
            == int(stage.removeprefix("onboarding_step_").removesuffix("_completed"))
        )
    return event_name == stage


def _funnel_attempt_length(
    events: Sequence[Row], opened: Row, *, window_days: int
) -> int:
    opened_key = _event_sort_key(opened)
    if opened_key is None:
        return 0
    deadline = opened_key[0] + timedelta(days=window_days)
    current_key = opened_key
    first_meal_saved_key = min(
        (
            candidate_key
            for candidate in events
            if candidate.get("event_name") == "meal_saved"
            and (candidate_key := _event_sort_key(candidate)) is not None
        ),
        default=None,
    )
    reached = 1
    for stage in PRODUCT_FUNNEL_STAGES[1:]:
        next_event: Row | None = None
        next_key: tuple[datetime, str] | None = None
        for candidate in events:
            candidate_key = _event_sort_key(candidate)
            if (
                candidate_key is not None
                and candidate_key > current_key
                and candidate_key[0] < deadline
                and _funnel_stage_matches(candidate, stage)
                and (
                    stage != "first_meal_saved"
                    or candidate_key == first_meal_saved_key
                )
            ):
                next_event = candidate
                next_key = candidate_key
                break
        if next_event is None or next_key is None:
            break
        current_key = next_key
        reached += 1
    return reached


def product_funnel(
    product_events: Sequence[Row], *, window_days: int = 7
) -> list[dict[str, Any]]:
    """Build one strict, seven-day, unique-actor product journey funnel.

    A bridge row containing both hashes maps earlier anonymous rows to the
    authenticated actor. Each actor contributes their best ordered attempt,
    and every next stage must occur after the previous stage in the same window.
    """

    aliases = _identity_aliases(product_events)
    by_actor: dict[str, list[Row]] = defaultdict(list)
    for row in product_events:
        actor = _canonical_actor(row, aliases)
        if actor and _event_sort_key(row) is not None:
            by_actor[actor].append(row)

    stage_counts = [0] * len(PRODUCT_FUNNEL_STAGES)
    for events in by_actor.values():
        ordered = sorted(events, key=lambda row: _event_sort_key(row))
        attempts = [
            _funnel_attempt_length(ordered, row, window_days=window_days)
            for row in ordered
            if row.get("event_name") == "app_opened"
        ]
        reached = max(attempts, default=0)
        for index in range(reached):
            stage_counts[index] += 1

    started = stage_counts[0]
    output: list[dict[str, Any]] = []
    for index, (stage, count) in enumerate(
        zip(PRODUCT_FUNNEL_STAGES, stage_counts, strict=True)
    ):
        previous = stage_counts[index - 1] if index else None
        output.append(
            {
                "stage": stage,
                "count": count,
                "prior_conversion": _ratio(count, previous)
                if previous is not None
                else None,
                "start_conversion": _ratio(count, started),
                "dropoff": (previous - count) if previous is not None else 0,
            }
        )
    return output


def product_retention(product_events: Sequence[Row]) -> dict[str, Any]:
    """Measure eligible D1/D7/D30 returns and exact weekly cohorts.

    Activation is each actor's first ``meal_saved`` day. A milestone is
    eligible only after the source snapshot has observed its full horizon;
    return-on-or-after counts a later saved-meal day at or after the target.
    Weekly rows instead count activity in that exact seven-day period.
    """

    aliases = _identity_aliases(product_events)
    meal_dates: dict[str, set[date]] = defaultdict(set)
    observed_until: dict[str, date] = {}
    for row in product_events:
        actor = _canonical_actor(row, aliases)
        occurred_at = _event_datetime(row)
        if actor is None or occurred_at is None:
            continue
        observed_day = occurred_at.astimezone(timezone.utc).date()
        observed_until[actor] = max(observed_until.get(actor, observed_day), observed_day)
        if row.get("event_name") == "meal_saved":
            meal_dates[actor].add(observed_day)

    activation_dates = {
        actor: min(dates) for actor, dates in meal_dates.items() if dates
    }
    latest_observed = max(observed_until.values(), default=None)
    milestones: list[dict[str, Any]] = []
    for period, days in (("D1", 1), ("D7", 7), ("D30", 30)):
        eligible = [
            actor
            for actor, activated in activation_dates.items()
            if latest_observed is not None
            and latest_observed >= activated + timedelta(days=days)
        ]
        returning = [
            actor
            for actor in eligible
            if any(
                saved_day >= activation_dates[actor] + timedelta(days=days)
                for saved_day in meal_dates[actor]
            )
        ]
        milestones.append(
            {
                "period": period,
                "days": days,
                "eligible_users": len(eligible),
                "returning_users": len(returning),
                "return_rate": _ratio(len(returning), len(eligible)),
            }
        )

    cohort_users: dict[date, set[str]] = defaultdict(set)
    for actor, activated in activation_dates.items():
        cohort_users[_week_start(activated)].add(actor)
    weekly_rows: list[dict[str, Any]] = []
    if latest_observed is not None:
        for cohort_week in sorted(cohort_users):
            max_period = max(0, (latest_observed - cohort_week).days // 7)
            for weeks_later in range(max_period + 1):
                period_start = cohort_week + timedelta(days=7 * weeks_later)
                period_end = period_start + timedelta(days=7)
                eligible = [
                    actor
                    for actor in cohort_users[cohort_week]
                    if latest_observed >= period_end - timedelta(days=1)
                ]
                returning = [
                    actor
                    for actor in eligible
                    if any(
                        period_start <= saved_day < period_end
                        for saved_day in meal_dates[actor]
                    )
                ]
                weekly_rows.append(
                    {
                        "cohort_week": cohort_week.isoformat(),
                        "weeks_later": weeks_later,
                        "cohort_size": len(cohort_users[cohort_week]),
                        "eligible_users": len(eligible),
                        "returning_users": len(returning),
                        "return_rate": _ratio(len(returning), len(eligible)),
                    }
                )

    return {"milestones": milestones, "weekly_cohorts": weekly_rows}


def _normalized_event_label(row: Row) -> str | None:
    event_name = row.get("event_name")
    if not isinstance(event_name, str) or event_name not in PRODUCT_EVENT_NAMES:
        return None
    suffix: str | None = None
    if event_name == "screen_viewed":
        suffix = _stable_key(row.get("screen_key"), max_length=48)
    elif event_name in {"signup_started", "signup_completed"}:
        method = _safe_text(row.get("signup_method"))
        suffix = method if method in {"email", "google", "apple", "other"} else None
    elif event_name in {
        "meal_analysis_started",
        "meal_analysis_completed",
        "meal_analysis_failed",
    }:
        mode = _safe_text(row.get("analysis_mode"))
        suffix = mode if mode in {"precise", "cheat"} else None
    elif event_name in {"meal_saved", "meal_discarded"}:
        mode = _safe_text(row.get("entry_mode"))
        suffix = mode if mode in CONTROLLED_ENTRY_MODES else None
    elif event_name in {"onboarding_step_viewed", "onboarding_step_completed"}:
        step = row.get("onboarding_step")
        if isinstance(step, int) and not isinstance(step, bool) and 0 <= step <= 3:
            suffix = str(step)
    elif event_name in {"feature_viewed", "feature_used", "feature_adopted"}:
        feature = _safe_text(row.get("feature_key"))
        suffix = feature if feature in CONTROLLED_FEATURE_KEYS else None
    elif event_name == "feedback_submitted":
        feedback_type = _safe_text(row.get("feedback_type"))
        suffix = feedback_type if feedback_type in {"bug", "ingredient", "idea"} else None
    return f"{event_name}:{suffix}" if suffix is not None else event_name


def journey_transitions(
    product_events: Sequence[Row], *, limit: int = JOURNEY_TRANSITION_LIMIT
) -> list[dict[str, Any]]:
    """Rank non-self consecutive normalized event transitions."""

    aliases = _identity_aliases(product_events)
    by_session: dict[str, list[tuple[tuple[datetime, str], str]]] = defaultdict(list)
    for row in product_events:
        event_key = _event_sort_key(row)
        label = _normalized_event_label(row)
        if event_key is None or label is None:
            continue
        session = _safe_text(row.get("session_hash")) or _canonical_actor(row, aliases)
        if session:
            by_session[session].append((event_key, label))

    counts: Counter[tuple[str, str]] = Counter()
    for events in by_session.values():
        ordered = sorted(events)
        for (_, previous), (_, current) in zip(ordered, ordered[1:]):
            if previous != current:
                counts[(previous, current)] += 1
    total = sum(counts.values())
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))[
        : max(0, limit)
    ]
    return [
        {
            "rank": rank,
            "from_event": source,
            "to_event": target,
            "count": count,
            "share": _ratio(count, total),
        }
        for rank, ((source, target), count) in enumerate(ranked, start=1)
    ]


def _later_meal(meal_times: Sequence[datetime], event_time: datetime) -> bool:
    return any(meal_time > event_time for meal_time in meal_times)


def feature_adoption(
    product_events: Sequence[Row], meals: Sequence[Row]
) -> dict[str, Any]:
    """Compare later-meal retention for exposed feature adopters and viewers.

    An adopter has a ``feature_used`` or ``feature_adopted`` event. A
    non-adopter is exposed by ``feature_viewed`` but has neither adoption event.
    Later-meal retention is the descriptive share with a meal strictly after
    first exposure; the result does not imply causation.
    """

    aliases = _identity_aliases(product_events)
    feature_states: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in product_events:
        feature = _safe_text(row.get("feature_key"))
        event_name = row.get("event_name")
        event_time = _event_datetime(row)
        actor = _canonical_actor(row, aliases)
        if (
            feature not in CONTROLLED_FEATURE_KEYS
            or event_name not in {"feature_viewed", "feature_used", "feature_adopted"}
            or actor is None
            or event_time is None
        ):
            continue
        state = feature_states[feature].setdefault(
            actor, {"first_exposure": event_time, "adopted": False}
        )
        state["first_exposure"] = min(state["first_exposure"], event_time)
        if event_name in {"feature_used", "feature_adopted"}:
            state["adopted"] = True

    actor_meals: dict[str, list[datetime]] = defaultdict(list)
    mode_actor_meals: dict[str, dict[str, list[datetime]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in meals:
        actor = _safe_text(row.get("user_hash"))
        meal_time = _as_datetime(row.get("logged_at"))
        mode = _safe_text(row.get("entry_mode"))
        if actor is None or meal_time is None:
            continue
        actor_meals[actor].append(meal_time)
        if mode in CONTROLLED_ENTRY_MODES:
            mode_actor_meals[mode][actor].append(meal_time)

    feature_rows: list[dict[str, Any]] = []
    for feature in sorted(feature_states):
        states = feature_states[feature]
        adopters = [actor for actor, state in states.items() if state["adopted"]]
        non_adopters = [actor for actor, state in states.items() if not state["adopted"]]
        returning_adopters = sum(
            _later_meal(actor_meals.get(actor, ()), states[actor]["first_exposure"])
            for actor in adopters
        )
        returning_non_adopters = sum(
            _later_meal(actor_meals.get(actor, ()), states[actor]["first_exposure"])
            for actor in non_adopters
        )
        feature_rows.append(
            {
                "feature": feature,
                "adopter_count": len(adopters),
                "adopter_returning_users": returning_adopters,
                "adopter_retention_rate": _ratio(returning_adopters, len(adopters)),
                "non_adopter_count": len(non_adopters),
                "non_adopter_returning_users": returning_non_adopters,
                "non_adopter_retention_rate": _ratio(
                    returning_non_adopters, len(non_adopters)
                ),
            }
        )

    entry_mode_rows: list[dict[str, Any]] = []
    for mode in sorted(mode_actor_meals):
        actors = mode_actor_meals[mode]
        first_times = {actor: min(times) for actor, times in actors.items()}
        returning = sum(
            _later_meal(actor_meals.get(actor, ()), first_time)
            for actor, first_time in first_times.items()
        )
        entry_mode_rows.append(
            {
                "entry_mode": mode,
                "user_count": len(first_times),
                "meal_count": sum(len(times) for times in actors.values()),
                "later_meal_users": returning,
                "later_meal_rate": _ratio(returning, len(first_times)),
            }
        )

    return {
        "definition": (
            "Adopters have feature_used or feature_adopted after exposure; "
            "non-adopters have feature_viewed without either event. "
            "Later-meal retention is the descriptive share with a meal after "
            "first exposure."
        ),
        "features": feature_rows,
        "entry_modes": entry_mode_rows,
    }


def _health_dimension(row: Row) -> tuple[str, str] | None:
    event_name = row.get("event_name")
    if event_name == "api_request_failed":
        return "route", _stable_key(row.get("route")) or "unknown"
    if event_name == "performance_measured":
        metric = _safe_text(row.get("metric"))
        return "metric", metric if metric in HEALTH_METRIC_KEYS else "unknown"
    if event_name == "health_check_failed":
        check = _safe_text(row.get("check"))
        return "check", check if check in HEALTH_CHECK_KEYS else "unknown"
    if event_name == "app_crashed":
        fatal = row.get("fatal")
        value = str(fatal).lower() if isinstance(fatal, bool) else "unknown"
        return "fatal", value
    return None


def _bounded_duration(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        duration = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(duration) or duration < 0 or duration > 120_000:
        return None
    return duration


def _utc_hour(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(
        minute=0, second=0, microsecond=0
    ).isoformat().replace("+00:00", "Z")


def app_health(health_events: Sequence[Row]) -> list[dict[str, Any]]:
    """Aggregate controlled health dimensions into UTC-hour buckets."""

    groups: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in health_events:
        event_name = row.get("event_name")
        if not isinstance(event_name, str) or event_name not in APP_HEALTH_EVENT_NAMES:
            continue
        occurred_at = _event_datetime(row)
        platform = _safe_text(row.get("platform"))
        dimension = _health_dimension(row)
        if occurred_at is None or platform not in {"web", "ios", "android"} or dimension is None:
            continue
        dimension_name, dimension_value = dimension
        key = (_utc_hour(occurred_at), platform, str(event_name), dimension_value)
        group = groups.setdefault(
            key,
            {
                "hour": key[0],
                "platform": platform,
                "event_name": event_name,
                "dimension": dimension_name,
                "dimension_value": dimension_value,
                "count": 0,
                "durations": [],
            },
        )
        group["count"] += 1
        duration = _bounded_duration(row.get("duration_ms"))
        if duration is not None:
            group["durations"].append(duration)

    output: list[dict[str, Any]] = []
    for key in sorted(groups):
        group = groups[key]
        durations = group.pop("durations")
        output.append(
            {
                **group,
                "p50_ms": _percentile(durations, 0.50) if durations else None,
                "p95_ms": _percentile(durations, 0.95) if durations else None,
            }
        )
    return output


def pipeline_meal_conversion(
    pipeline_runs: Sequence[Row], pipeline_meals: Sequence[Row]
) -> list[dict[str, Any]]:
    """Compare unique pipeline requests with ownership-checked saved meals."""

    requests_by_date: dict[str, set[str]] = defaultdict(set)
    request_dates: dict[str, str] = {}
    for row in pipeline_runs:
        request_id = _safe_text(row.get("id"))
        day = _as_date(row.get("created_at"))
        if request_id is None or day is None:
            continue
        day_text = day.isoformat()
        previous_day = request_dates.get(request_id)
        if previous_day is not None and previous_day <= day_text:
            continue
        if previous_day is not None:
            requests_by_date[previous_day].discard(request_id)
            if not requests_by_date[previous_day]:
                del requests_by_date[previous_day]
        request_dates[request_id] = day_text
        requests_by_date[day_text].add(request_id)

    converted_requests_by_date: dict[str, set[str]] = defaultdict(set)
    for row in pipeline_meals:
        request_id = _safe_text(row.get("pipeline_request_id"))
        day = request_dates.get(request_id or "")
        if request_id is None or day is None:
            continue
        # Conversion is request-level: one request may materialize multiple
        # meal rows, but it must count only once in the numerator.
        converted_requests_by_date[day].add(request_id)

    output: list[dict[str, Any]] = []
    for day in sorted(requests_by_date):
        request_count = len(requests_by_date[day])
        converted_count = len(converted_requests_by_date.get(day, set()))
        output.append(
            {
                "date": day,
                "pipeline_request_count": request_count,
                "converted_request_count": converted_count,
                "save_rate": _ratio(converted_count, request_count),
            }
        )
    return output


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


def _ingredient_query(row: Row) -> str | None:
    value = row.get("ingredient_query")
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.split())
    if not normalized or len(normalized) > INGREDIENT_QUERY_MAX_LENGTH:
        return None
    return normalized.casefold()


def _ingredient_label(value: Any, *, max_length: int = 200) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.split())
    if not normalized or len(normalized) > max_length:
        return None
    return normalized


def _ingredient_food_id(value: Any) -> str | None:
    value = _safe_text(value)
    if value is None or len(value) > 128:
        return None
    if not all(character.isalnum() or character in "_-" for character in value):
        return None
    return value


def _ingredient_source(value: Any) -> str | None:
    value = _safe_text(value)
    if value is None or len(value) > 64:
        return None
    if not value[0].isalnum() or not all(
        character.isalnum() or character in "_.:-" for character in value
    ):
        return None
    return value


def _ingredient_similarity(value: Any) -> float | int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number < 0 or number > 1:
        return None
    rounded = round(number, 6)
    return int(rounded) if rounded.is_integer() else rounded


def _ingredient_candidate(row: Row, rank: int) -> dict[str, Any] | None:
    prefix = f"candidate_{rank}_"
    summary = {
        "food_id": _ingredient_food_id(row.get(f"{prefix}food_id")),
        "name": _ingredient_label(row.get(f"{prefix}name")),
        "source": _ingredient_source(row.get(f"{prefix}source")),
        "similarity": _ingredient_similarity(row.get(f"{prefix}similarity")),
    }
    return summary if any(value is not None for value in summary.values()) else None


def _ingredient_chosen(row: Row) -> dict[str, Any] | None:
    summary = {
        "food_id": _ingredient_food_id(row.get("chosen_food_id")),
        "name": _ingredient_label(row.get("chosen_name")),
        "source": _ingredient_source(row.get("chosen_source")),
        "similarity": _ingredient_similarity(row.get("chosen_similarity")),
    }
    return summary if any(value is not None for value in summary.values()) else None


def _ingredient_summary_signature(summary: Mapping[str, Any] | None) -> tuple[str, ...]:
    if summary is None:
        return ("", "", "", "")
    return tuple(
        "" if summary.get(field) is None else str(summary[field])
        for field in ("food_id", "name", "source", "similarity")
    )


def _ingredient_mapping_signature(
    candidates: Sequence[dict[str, Any] | None], chosen: Mapping[str, Any] | None
) -> tuple[str, ...]:
    return tuple(
        value
        for summary in (*candidates, chosen)
        for value in _ingredient_summary_signature(summary)
    )


def _ingredient_verdict(value: Any) -> str | None:
    value = _safe_text(value)
    return value if value in {"accepted", "unmatched", "rejected", "missing"} else None


def _ingredient_reject_bucket(row: Row, verdict: str) -> str:
    bucket = _safe_text(row.get("reject_bucket"))
    if bucket in INGREDIENT_REJECT_BUCKETS:
        return bucket
    return "unmatched" if verdict == "unmatched" else "other"


def _ingredient_integer(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def ingredient_demand(
    ingredient_decisions: Sequence[Row], limit: int = INGREDIENT_METRIC_LIMIT
) -> list[dict[str, Any]]:
    """Rank bounded ingredient queries by observed decision frequency."""

    counts: Counter[tuple[str, str]] = Counter()
    for row in ingredient_decisions:
        query = _ingredient_query(row)
        if query is not None:
            day = _as_date(row.get("occurred_on"))
            counts[(day.isoformat() if day else "", query)] += 1
    output: list[dict[str, Any]] = []
    for day in sorted({key[0] for key in counts}):
        ranked = sorted(
            ((query, count) for (row_day, query), count in counts.items() if row_day == day),
            key=lambda item: (-item[1], item[0]),
        )[: max(0, limit)]
        for rank, (query, count) in enumerate(ranked, start=1):
            output.append(
                {
                    **({"date": day} if day else {}),
                    "rank": rank,
                    "ingredient_query": query,
                    "count": count,
                }
            )
    return output


def ingredient_mappings(
    ingredient_decisions: Sequence[Row], limit: int = INGREDIENT_METRIC_LIMIT
) -> list[dict[str, Any]]:
    """Summarize the most frequent candidate mapping observed for each query."""

    states: dict[tuple[str, str], dict[str, Any]] = {}
    for row in ingredient_decisions:
        query = _ingredient_query(row)
        if query is None:
            continue
        candidates = [_ingredient_candidate(row, rank) for rank in range(1, 4)]
        chosen = _ingredient_chosen(row)
        signature = _ingredient_mapping_signature(candidates, chosen)
        day = _as_date(row.get("occurred_on"))
        state = states.setdefault(
            (day.isoformat() if day else "", query),
            {"decision_count": 0, "accepted_count": 0, "mappings": {}},
        )
        state["decision_count"] += 1
        if _ingredient_verdict(row.get("verdict")) == "accepted":
            state["accepted_count"] += 1
        mappings = state["mappings"]
        record = mappings.setdefault(
            signature,
            {"count": 0, "candidates": candidates, "chosen": chosen},
        )
        record["count"] += 1

    output: list[dict[str, Any]] = []
    for day in sorted({key[0] for key in states}):
        ranked_queries = sorted(
            ((query, state) for (row_day, query), state in states.items() if row_day == day),
            key=lambda item: (-item[1]["decision_count"], item[0]),
        )[: max(0, limit)]
        for rank, (query, state) in enumerate(ranked_queries, start=1):
            representative = sorted(
                state["mappings"].items(),
                key=lambda item: (-item[1]["count"], item[0]),
            )[0][1]
            candidate_rows = [
                {"rank": candidate_rank, **candidate}
                for candidate_rank, candidate in enumerate(representative["candidates"], 1)
                if candidate is not None
            ]
            output.append(
                {
                    **({"date": day} if day else {}),
                    "rank": rank,
                    "ingredient_query": query,
                    "decision_count": state["decision_count"],
                    "accepted_count": state["accepted_count"],
                    "candidates": candidate_rows,
                    "chosen": representative["chosen"],
                }
            )
    return output


def corpus_reverse_lookup(
    ingredient_decisions: Sequence[Row],
    limit: int = INGREDIENT_METRIC_LIMIT,
    example_limit: int = CORPUS_QUERY_EXAMPLE_LIMIT,
) -> list[dict[str, Any]]:
    """Rank canonical chosen foods with bounded query examples."""

    groups: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in ingredient_decisions:
        if _ingredient_verdict(row.get("verdict")) != "accepted":
            continue
        chosen = _ingredient_chosen(row)
        if chosen is None or chosen.get("food_id") is None:
            continue
        day = _as_date(row.get("occurred_on"))
        key = (
            day.isoformat() if day else "",
            str(chosen.get("food_id") or ""),
            str(chosen.get("name") or ""),
            str(chosen.get("source") or ""),
        )
        group = groups.setdefault(
            key, {"chosen": chosen, "decision_count": 0, "queries": Counter()}
        )
        group["decision_count"] += 1
        query = _ingredient_query(row)
        if query is not None:
            group["queries"][query] += 1

    ranked = sorted(
        groups.items(),
        key=lambda item: (
            -item[1]["decision_count"],
            -len(item[1]["queries"]),
            item[0],
        ),
    )[: max(0, limit)]
    output: list[dict[str, Any]] = []
    for rank, (_key, group) in enumerate(ranked, start=1):
        chosen = group["chosen"]
        examples = sorted(
            group["queries"].items(), key=lambda item: (-item[1], item[0])
        )[: max(0, example_limit)]
        output.append(
            {
                **({"date": _key[0]} if _key[0] else {}),
                "rank": rank,
                "food_id": chosen.get("food_id"),
                "food_name": chosen.get("name"),
                "source": chosen.get("source"),
                "decision_count": group["decision_count"],
                "query_count": len(group["queries"]),
                "query_examples": [query for query, _count in examples],
            }
        )
    return output


def ingredient_gaps(
    ingredient_decisions: Sequence[Row], limit: int = INGREDIENT_METRIC_LIMIT
) -> list[dict[str, Any]]:
    """Rank unmatched and rejected queries by their controlled reason bucket."""

    counts: Counter[tuple[str, str, str, str]] = Counter()
    for row in ingredient_decisions:
        verdict = _ingredient_verdict(row.get("verdict"))
        query = _ingredient_query(row)
        if verdict not in {"unmatched", "rejected"} or query is None:
            continue
        day = _as_date(row.get("occurred_on"))
        counts[
            (
                day.isoformat() if day else "",
                query,
                verdict,
                _ingredient_reject_bucket(row, verdict),
            )
        ] += 1
    ranked = sorted(
        counts.items(),
        key=lambda item: (-item[1], item[0][0], item[0][1], item[0][2], item[0][3]),
    )[: max(0, limit)]
    return [
        {
            **({"date": day} if day else {}),
            "rank": rank,
            "ingredient_query": query,
            "verdict": verdict,
            "reject_bucket": bucket,
            "count": count,
        }
        for rank, ((day, query, verdict, bucket), count) in enumerate(ranked, start=1)
    ]


def ingredient_rank_distribution(
    ingredient_decisions: Sequence[Row],
) -> list[dict[str, Any]]:
    """Report selected-rank shares within each accepted candidate pool size."""

    counts: dict[tuple[str, int], Counter[int]] = defaultdict(Counter)
    for row in ingredient_decisions:
        if _ingredient_verdict(row.get("verdict")) != "accepted":
            continue
        pool_size = _ingredient_integer(row.get("pool_size"))
        selected_rank = _ingredient_integer(row.get("selected_rank"))
        if (
            pool_size is None
            or selected_rank is None
            or pool_size < 1
            or selected_rank < 1
            or selected_rank > pool_size
        ):
            continue
        day = _as_date(row.get("occurred_on"))
        counts[(day.isoformat() if day else "", pool_size)][selected_rank] += 1

    output: list[dict[str, Any]] = []
    for day, pool_size in sorted(counts):
        total = sum(counts[(day, pool_size)].values())
        for selected_rank, count in sorted(counts[(day, pool_size)].items()):
            output.append(
                {
                    **({"date": day} if day else {}),
                    "pool_size": pool_size,
                    "selected_rank": selected_rank,
                    "count": count,
                    "share": _ratio(count, total),
                }
            )
    return output


def compute_aggregates(rows_by_view: Mapping[str, Sequence[Row]]) -> dict[str, Any]:
    """Compute the app-health and AI-pipeline operational aggregates."""

    meals = rows_by_view.get("v_meals", ())
    pipeline_runs = rows_by_view.get("v_pipeline_runs", ())
    budget_events = rows_by_view.get("v_budget_events", ())
    health_events = rows_by_view.get("v_app_health", ())
    ingredient_decisions = rows_by_view.get("v_ingredient_decisions", ())
    aggregates = {
        "dau_wau": dau_wau(meals),
        "macro_distributions": macro_distributions(meals),
        "ai_latency": ai_latency(pipeline_runs),
        "ai_failure_rate": ai_failure_rate(budget_events),
        "token_cost_daily": token_cost_daily(budget_events),
        "match_rate": match_rate(pipeline_runs),
        "implausible_foods": implausible_foods(
            rows_by_view.get("v_food_composition", ())
        ),
        "app_health": app_health(health_events),
        "ingredient_demand": ingredient_demand(ingredient_decisions),
        "ingredient_mappings": ingredient_mappings(ingredient_decisions),
        "corpus_reverse_lookup": corpus_reverse_lookup(ingredient_decisions),
        "ingredient_gaps": ingredient_gaps(ingredient_decisions),
        "ingredient_rank_distribution": ingredient_rank_distribution(
            ingredient_decisions
        ),
    }
    assert tuple(aggregates) == AGGREGATE_NAMES
    return aggregates
