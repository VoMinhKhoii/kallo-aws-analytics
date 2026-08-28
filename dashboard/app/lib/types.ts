export const METRIC_NAMES = [
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
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

/**
 * Panel order and column span for the dashboard grid, in render order.
 * app/loading.tsx renders one skeleton per entry instead of keeping its own
 * hardcoded array, which previously desynced whenever a panel was added.
 * Keep this in step with the grid in app/components/dashboard.tsx.
 */
export const PANEL_LAYOUT = [
  { key: "engagement", span: "wide" },
  { key: "meal-volume", span: "half" },
  { key: "macros", span: "half" },
  { key: "top-foods", span: "half" },
  { key: "funnel", span: "half" },
  { key: "ai-health", span: "wide" },
  { key: "token-cost", span: "half" },
  { key: "match-rate", span: "half" },
  { key: "coverage", span: "wide" },
] as const;

export type DauWauRow = { date: string; dau: number; wau: number };
export type RetentionRow = {
  cohort_week: string;
  weeks_later: number;
  cohort_size: number;
  active_users: number;
  retention_rate: number;
};
export type MealVolumeRow = {
  date: string;
  meal_slot: string;
  entry_mode: string;
  count: number;
};
export type MacroRow = {
  nutrient: string;
  bucket_min: number;
  bucket_max: number | null;
  count: number;
};
export type TopFoodRow = { rank: number; ingredient_name: string; count: number };
export type LatencyRow = {
  date: string;
  model: string;
  call_count: number;
  p50_ms: number;
  p95_ms: number;
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
export type FunnelPayload = {
  total_users: number;
  completed_users: number;
  completion_share: number;
  steps: Array<{ step: number; user_count: number; share_of_started: number }>;
};
export type CoverageGapRow = { rank: number; query_text: string; count: number };
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

export type MetricPayloadMap = {
  dau_wau: DauWauRow[];
  retention_cohorts: RetentionRow[];
  meal_volume: MealVolumeRow[];
  macro_distributions: MacroRow[];
  top_foods: TopFoodRow[];
  ai_latency: LatencyRow[];
  ai_failure_rate: FailureRow[];
  token_cost_daily: TokenCostRow[];
  match_rate: MatchRateRow[];
  onboarding_funnel: FunnelPayload;
  coverage_gaps: CoverageGapRow[];
  implausible_foods: ImplausibleFoodRow[];
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
