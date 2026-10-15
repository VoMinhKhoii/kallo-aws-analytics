"use client";
import { useMemo } from 'react';
import { rangeWindow, type ConsoleRange } from '@/components/console/console';
import { useMetricBundle } from '@/lib/use-metric-bundle';
import { aggregateMappings } from '@/lib/ingredient-mappings';
import { aggregateDemand, aggregateGaps, aggregateRanks, aggregateReverse, aggregateMacros } from './aggregate';
const METRICS = ['ingredient_demand', 'ingredient_mappings', 'corpus_reverse_lookup', 'ingredient_gaps', 'ingredient_rank_distribution', 'match_rate', 'macro_distributions', 'implausible_foods'] as const;
export function useIngredients(win: string) {
  const window = useMemo(() => rangeWindow(win as ConsoleRange), [win]);
  const bundle = useMetricBundle(METRICS, window.from, window.to);
  // TODO(backend): provide full-population decisions / acceptance and previous
  // complete-window summaries. Current demand/mapping/gap rows are daily top 50.
  const mappings = aggregateMappings(bundle.data?.ingredient_mappings ?? []);
  const demand = aggregateDemand(bundle.data?.ingredient_demand ?? []);
  const gaps = aggregateGaps(bundle.data?.ingredient_gaps ?? []);
  const ranks = aggregateRanks(bundle.data?.ingredient_rank_distribution ?? []);
  const reverse = aggregateReverse(bundle.data?.corpus_reverse_lookup ?? []);
  const macros = aggregateMacros(bundle.data?.macro_distributions ?? []);
  return {bundle, mappings, demand, gaps, ranks, reverse, macros, matches: bundle.data?.match_rate ?? [], flags: bundle.data?.implausible_foods ?? []};
}
