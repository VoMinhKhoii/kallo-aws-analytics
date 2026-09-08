import aiFailureRate from "@/mocks/ai_failure_rate.json";
import aiLatency from "@/mocks/ai_latency.json";
import appHealth from "@/mocks/app_health.json";
import corpusReverseLookup from "@/mocks/corpus_reverse_lookup.json";
import dauWau from "@/mocks/dau_wau.json";
import implausibleFoods from "@/mocks/implausible_foods.json";
import ingredientDemand from "@/mocks/ingredient_demand.json";
import ingredientGaps from "@/mocks/ingredient_gaps.json";
import ingredientMappings from "@/mocks/ingredient_mappings.json";
import ingredientRankDistribution from "@/mocks/ingredient_rank_distribution.json";
import macroDistributions from "@/mocks/macro_distributions.json";
import matchRate from "@/mocks/match_rate.json";
import tokenCostDaily from "@/mocks/token_cost_daily.json";
import type { MetricName, MetricPayloadMap } from "./types";

// Local fixtures cover the retained operational metrics where samples exist.
export const MOCK_METRICS: Partial<MetricPayloadMap> = {
  dau_wau: dauWau,
  macro_distributions: macroDistributions,
  ai_latency: aiLatency,
  ai_failure_rate: aiFailureRate,
  token_cost_daily: tokenCostDaily,
  match_rate: matchRate,
  implausible_foods: implausibleFoods,
  app_health: appHealth,
  ingredient_demand: ingredientDemand,
  ingredient_mappings: ingredientMappings,
  corpus_reverse_lookup: corpusReverseLookup,
  ingredient_gaps: ingredientGaps,
  ingredient_rank_distribution: ingredientRankDistribution,
};

export function getMockMetric<T extends MetricName>(metric: T): MetricPayloadMap[T] {
  const value = MOCK_METRICS[metric];
  if (value === undefined) throw new Error(`No local fixture exists for ${metric}`);
  return value as MetricPayloadMap[T];
}
