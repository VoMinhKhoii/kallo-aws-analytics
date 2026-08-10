import aiFailureRate from "@/mocks/ai_failure_rate.json";
import aiLatency from "@/mocks/ai_latency.json";
import coverageGaps from "@/mocks/coverage_gaps.json";
import dauWau from "@/mocks/dau_wau.json";
import implausibleFoods from "@/mocks/implausible_foods.json";
import macroDistributions from "@/mocks/macro_distributions.json";
import matchRate from "@/mocks/match_rate.json";
import mealVolume from "@/mocks/meal_volume.json";
import onboardingFunnel from "@/mocks/onboarding_funnel.json";
import retentionCohorts from "@/mocks/retention_cohorts.json";
import tokenCostDaily from "@/mocks/token_cost_daily.json";
import topFoods from "@/mocks/top_foods.json";
import type { MetricName, MetricPayloadMap } from "./types";

export const MOCK_METRICS: MetricPayloadMap = {
  dau_wau: dauWau,
  retention_cohorts: retentionCohorts,
  meal_volume: mealVolume,
  macro_distributions: macroDistributions,
  top_foods: topFoods,
  ai_latency: aiLatency,
  ai_failure_rate: aiFailureRate,
  token_cost_daily: tokenCostDaily,
  match_rate: matchRate,
  onboarding_funnel: onboardingFunnel,
  coverage_gaps: coverageGaps,
  implausible_foods: implausibleFoods,
};

export function getMockMetric<T extends MetricName>(metric: T): MetricPayloadMap[T] {
  return MOCK_METRICS[metric];
}
