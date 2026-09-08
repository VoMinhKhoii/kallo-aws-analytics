# Operational analytics aggregate contract

Glue writes thirteen bounded JSON payloads from six sanitized Supabase views.
The contract is intentionally small for the beta assignment: it describes
aggregate app usage, application health, AI-pipeline performance, and food-data
quality. It does not model funnels, retention cohorts, user journeys, feature
adoption, onboarding, meal habits, or request-to-meal conversion.

No payload contains a raw user, session, request, meal, or telemetry-event
identifier. The HMAC `user_hash` in `v_meals` is used only inside Glue to count
distinct aggregate DAU/WAU and is not emitted.

## Usage and output shape

### `dau_wau`

One row per UTC day with `date`, `dau`, and rolling seven-day `wau`. An actor is
active when they log a meal. The dashboard shows the latest numbers for quick
orientation and plots both series across the selected window.

### `macro_distributions`

Fixed buckets for `calories_kcal`, `protein_g`, `carbohydrate_g`, and `fat_g`.
Each row contains `nutrient`, `bucket_min`, `bucket_max`, and `count`. The UI
renders a selectable histogram so clusters, long tails, and impossible spikes
are visible without reading a table of bucket counts.

## AI pipeline

### `ai_latency`

Daily model rows with `date`, `model`, `call_count`, `p50_ms`, `p95_ms`, and
`p99_ms`. The UI plots the percentiles as separate lines. A multi-model daily
overview uses the highest observed percentile at each level and labels that
choice explicitly.

### `ai_failure_rate`

Daily provider/model rows with `event_count`, `failure_count`, and
`failure_rate`. The overview line is weighted by event count rather than an
unweighted average of model rates; exact provider/model rows remain below it.

### `token_cost_daily`

Daily model rows with observed `input_tokens`, `output_tokens`, `cost_usd`, and
`pricing_known`. Token series are plotted over time. Dollar estimates appear
only for models with a configured price and are not presented as total AWS
infrastructure cost.

### `match_rate`

Daily pipeline rows with `matched_count`, `unmatched_count`,
`ingredient_count`, `unaccounted_count`, and `match_rate`. The denominator is
the full ingredient population observed by the run, so unaccounted ingredients
remain visible. The dashboard plots match rate across time.

## Application health

### `app_health`

Only `api_request_failed`, `app_crashed`, `performance_measured`, and
`health_check_failed` events are accepted. Rows are grouped by UTC hour,
platform, event, and one controlled dimension (`route`, `metric`, `check`, or
`fatal`). Each row contains `hour`, `platform`, `event_name`, `dimension`,
`dimension_value`, `count`, `p50_ms`, and `p95_ms`.

The source view excludes actor, anonymous, and session hashes, error messages,
stack traces, and arbitrary event properties. The dashboard plots hourly event
volume and retains the bounded table for diagnosis.

## Ingredient and food-corpus quality

### `ingredient_demand`

Ranks normalized ingredient queries by observed decision count, capped at 50.
Each row contains `rank`, `ingredient_query`, and `count`.

### `ingredient_mappings`

Keeps one deterministic candidate and chosen-food summary for each of the most
frequent ingredient queries, capped at 50. Candidate and chosen `food_id`
values are catalogue identifiers, not person or pipeline identifiers.

### `corpus_reverse_lookup`

Ranks accepted canonical foods by decision count. Rows include `food_id`,
`food_name`, `source`, `decision_count`, distinct `query_count`, and up to five
deterministic food-query examples.

### `ingredient_gaps`

Ranks only unmatched and rejected decisions by normalized food query,
controlled verdict, and controlled reject bucket. Source reject text is not
carried forward. Output is capped at 50 rows.

### `ingredient_rank_distribution`

Counts accepted selected ranks within each candidate-pool size and reports the
within-pool share. The UI presents the distribution visually so rank-quality
clusters are easy to compare.

### `implausible_foods`

Lists catalogue foods violating one or more of three fixed rules:

- calories are positive while protein, carbohydrate, and fat are all zero;
- a carbohydrate-staple food type has zero carbohydrate;
- calories inferred from the 4/4/9 macro formula differ from stored calories by
  more than 40 percent.

This is a deterministic quality watchlist, not a generalized anomaly detector.

## Retired beta-scope metrics

The reduction migration drops the views and functions that fed
`retention_cohorts`, `meal_volume`, `top_foods`, `onboarding_funnel`,
`coverage_gaps`, `product_funnel`, `product_retention`, `journey_transitions`,
`feature_adoption`, and `pipeline_meal_conversion`. Older append-only migration
files remain in version control as database history; the latest migration is
the authoritative final state.
