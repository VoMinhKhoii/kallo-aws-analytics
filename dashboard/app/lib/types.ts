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
];

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
