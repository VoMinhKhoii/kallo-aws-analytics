"use client";
import { floorHour } from '@/lib/windows';
import { usageRange } from '@/lib/ai-usage/aggregate';
import { useRefocus } from '@/lib/use-refocus';
import { useMemo, useState } from 'react';
import { rangeWindow, type ConsoleRange } from '@/components/console/console';
import { useMetricBundle } from '@/lib/use-metric-bundle';
import { aggregateMappings } from '@/lib/ingredient-mappings';
import { aggregateDemand, aggregateGaps, aggregateRanks, aggregateReverse, aggregateMacros, matchRateRows } from './aggregate';
const CHART_METRICS = ['match_rate'] as const;
const METRICS = ['ingredient_demand', 'ingredient_mappings', 'corpus_reverse_lookup', 'ingredient_gaps', 'ingredient_rank_distribution', 'match_rate', 'macro_distributions', 'implausible_foods'] as const;
export function useIngredients(win: string) {
  const [asOf, setAsOf] = useState(() => new Date());
  const window = useMemo(() => rangeWindow(win as ConsoleRange, asOf), [win, asOf]);
  const bundle = useMetricBundle(METRICS, window.from, window.to);
  const chart = useMetricBundle(CHART_METRICS, win === '24h' ? floorHour(window.from) : window.from, window.to, win === '24h');
  const refresh = () => { setAsOf(new Date()); bundle.refresh(); chart.refresh(); };
  useRefocus(refresh);
  // TODO(backend): provide full-population decisions / acceptance and previous
  // complete-window summaries. Current demand/mapping/gap rows are daily top 50.
  const mappings = aggregateMappings(bundle.data?.ingredient_mappings ?? []);
  const demand = aggregateDemand(bundle.data?.ingredient_demand ?? []);
  const gaps = aggregateGaps(bundle.data?.ingredient_gaps ?? []);
  const ranks = aggregateRanks(bundle.data?.ingredient_rank_distribution ?? []);
  const reverse = aggregateReverse(bundle.data?.corpus_reverse_lookup ?? []);
  const macros = aggregateMacros(bundle.data?.macro_distributions ?? []);
  return {chartMatches: win === '24h' ? matchRateRows(chart.data?.match_rate ?? [], usageRange(window.to, 1)) : undefined, chartError: win === '24h' ? chart.error ?? chart.errors.match_rate : null, bundle: {...bundle, refresh, loading: bundle.loading || chart.loading, refreshing: bundle.refreshing || chart.refreshing}, mappings, demand, gaps, ranks, reverse, macros, matches: matchRateRows(bundle.data?.match_rate ?? [], usageRange(window.to, window.days as 1|7|30)), flags: bundle.data?.implausible_foods ?? []};
}
