export const METRIC_NAMES = [
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
  "ai_usage_daily",
  "ai_model_window",
  "ai_meals_daily",
  "ai_meal_window",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export const OPERATIONAL_METRIC_NAMES = METRIC_NAMES as readonly [
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
  "ai_usage_daily",
  "ai_model_window",
  "ai_meals_daily",
  "ai_meal_window",
];

/**
 * One model's attempts (request_count = 0 rows of analytics.v_budget_events)
 * over one UTC day, or over the whole requested window. Spend is the sum of
 * Kallo-priced `cost_usd`; NULL-cost attempts are counted in `unpriced_calls`.
 */
export type AiModelUsageRow = {
  model: string;
  /** Every attempt of the model in the slice was shadow work. */
  shadow: boolean;
  calls: number;
  errors: number;
  unpriced_calls: number;
  spend_usd: number | null;
  /** The part of `spend_usd` spent on shadow work. */
  shadow_spend_usd: number | null;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  thought_tokens: number;
  /** Attempts that recorded a latency; older rows predate per-call timing. */
  timed_calls: number;
  p95_ms: number | null;
  p99_ms: number | null;
  /** Successful Gemini attempts that stood in for this (Claude) model. */
  fallbacks: number;
};
export type AiUsageDailyRow = AiModelUsageRow & { date: string };

/** Primary meal analyses: cost summed per request_id. */
export type AiMealsRow = {
  meals: number;
  /** Model calls (attempts) made by these analyses. */
  calls: number;
  /** Analyses whose every attempt was priced; the cost stats cover only these. */
  priced_meals: number;
  spend_usd: number | null;
  p95_meal_usd: number | null;
};
export type AiMealsDailyRow = AiMealsRow & { date: string };

export type DauWauRow = { date: string; dau: number; wau: number };
export type MacroRow = {
  date?: string;
  nutrient: string;
  bucket_min: number;
  bucket_max: number | null;
  count: number;
};
export type LatencyRow = {
  date: string;
  model: string;
  call_count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms?: number;
};
export type FailureRow = {
  date: string;
  provider: string;
  model: string;
  event_count: number;
  failure_count: number;
  failure_rate: number;
};
export type TokenCostRow = {
  date: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  pricing_known: boolean;
};
export type MatchRateRow = {
  date: string;
  matched_count: number;
  unmatched_count: number;
  ingredient_count: number;
  unaccounted_count: number;
  match_rate: number;
};
export type ImplausibleFoodRow = {
  id: string | number | null;
  name_en: string | null;
  type_en: string | null;
  calories_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  macro_calories_kcal: number;
  mismatch_share: number;
  reasons: string[];
};

export type AppHealthRow = {
  hour: string;
  platform: string;
  event_name: string;
  dimension: string;
  dimension_value: string;
  count: number;
  p50_ms: number | null;
  p95_ms: number | null;
};

export type IngredientCandidate = {
  rank: number;
  food_id: string | null;
  name: string | null;
  source: string | null;
  similarity: number | null;
};

export type IngredientSummary = {
  food_id: string | null;
  name: string | null;
  source: string | null;
  similarity: number | null;
};

export type IngredientDemandRow = {
  date?: string;
  rank: number;
  ingredient_query: string;
  count: number;
};

export type IngredientMappingRow = {
  date?: string;
  rank: number;
  ingredient_query: string;
  decision_count: number;
  accepted_count: number;
  candidates: IngredientCandidate[];
  chosen: IngredientSummary | null;
};

export type CorpusReverseLookupRow = {
  date?: string;
  rank: number;
  food_id: string | null;
  food_name: string | null;
  source: string | null;
  decision_count: number;
  query_count: number;
  query_examples: string[];
};

export type IngredientGapRow = {
  date?: string;
  rank: number;
  ingredient_query: string;
  verdict: string;
  reject_bucket: string;
  count: number;
};

export type IngredientRankDistributionRow = {
  date?: string;
  pool_size: number;
  selected_rank: number;
  count: number;
  share: number;
};

export type MetricPayloadMap = {
  dau_wau: DauWauRow[];
  macro_distributions: MacroRow[];
  ai_latency: LatencyRow[];
  ai_failure_rate: FailureRow[];
  token_cost_daily: TokenCostRow[];
  match_rate: MatchRateRow[];
  implausible_foods: ImplausibleFoodRow[];
  app_health: AppHealthRow[];
  ingredient_demand: IngredientDemandRow[];
  ingredient_mappings: IngredientMappingRow[];
  corpus_reverse_lookup: CorpusReverseLookupRow[];
  ingredient_gaps: IngredientGapRow[];
  ingredient_rank_distribution: IngredientRankDistributionRow[];
  ai_usage_daily: AiUsageDailyRow[];
  ai_model_window: AiModelUsageRow[];
  ai_meals_daily: AiMealsDailyRow[];
  ai_meal_window: AiMealsRow[];
};

export type MetricItem<T> = {
  metric: string;
  date: string;
  payload: T;
};

export type MetricResponse<T> = {
  metric: string;
  from: string;
  to: string;
  items: Array<MetricItem<T>>;
};

export type DashboardMetrics = MetricPayloadMap;

export type MetricBundle = {
  collectedAt?: string;
  collectedAtByMetric?: Partial<Record<MetricName, string>>;
  data: Partial<DashboardMetrics>;
  errors: Partial<Record<MetricName, string>>;
  from: string;
  to: string;
};

export type RunStatus = {
  metric?: string;
  date?: string;
  run_id: string;
  phase: string;
  updated_at?: string;
  completed_at?: string;
  manifest_key?: string;
  glue_job_run_id?: string;
  failure_reason?: string;
};

export type CloudRunSystemPoint = {
  timestamp: string;
  request_count?: number;
  error_count?: number;
  error_rate?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  ai_p50_ms?: number;
  ai_p95_ms?: number;
  ai_p99_ms?: number;
  normal_p50_ms?: number;
  normal_p95_ms?: number;
  normal_p99_ms?: number;
  startup_p95_ms?: number;
  cpu_p95?: number;
  memory_p95?: number;
  instances?: number;
};

export type CloudMonitoringResponse = {
  delivery_source?: 'cloudflare-direct';
  source: "google-cloud-monitoring";
  project: string;
  service: string;
  location: string;
  from: string;
  to: string;
  alignment_seconds: number;
  collected_at: string;
  route_source?: "cloud-logging-dynamodb";
  route_points?: number;
  route_retention_days?: number;
  series: CloudRunSystemPoint[];
};
