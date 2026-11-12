"use client";

import { preloaded } from "@/components/charts/preloaded";
import { ChartSkeleton } from "@/components/shared/chart-skeleton";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import * as React from "react";
const CostLatency = preloaded(() => import("@/components/ai-usage/cost-latency").then(m => m.CostLatency), () => <ChartSkeleton height={234} />);
const AiTrend = preloaded(() => import("@/components/ai-usage/trends").then(m => m.AiTrend), () => <ChartSkeleton height={340} />);
const ModelTable = preloaded(() => import("@/components/ai-usage/model-table").then(m => m.ModelTable), () => <ChartSkeleton height={160} />);
import { MetricSection } from "@/components/shared/metric-section";
import { PageHeader } from "@/components/shared/page-header";
import type { AiMealsDailyRow, AiMealsRow, AiModelUsageRow, AiUsageDailyRow } from "@/app/lib/types";
import { dayRange, modelsOf, summarize, type UsageInput, type WindowDays } from "@/lib/ai-usage/aggregate";
import { decimal, delta, int, ms, pct, shortDate, usd } from "@/lib/ai-usage/format";
import { Change } from "@/components/shared/kpi-cell";
import { MetricTabs, type MetricTab } from "@/components/shared/metric-tabs";
import type { AiTrendMetric } from "@/components/ai-usage/trends";
import type { Kpi } from "@/lib/ai-usage/aggregate";
import { useRefocus } from "@/lib/use-refocus";
import { useMetricBundle } from "@/lib/use-metric-bundle";

const DAILY = ["ai_usage_daily", "ai_meals_daily"] as const;
const WINDOW = ["ai_model_window", "ai_meal_window"] as const;


export function AiUsage({ win, setWin }: { win: WindowDays; setWin: (win: WindowDays) => void }) {
  const [asOf, setAsOf] = React.useState(() => new Date().toISOString());
  const [tab, setTab] = React.useState<AiTrendMetric>("spend");
  const today = win === 1 ? asOf : asOf.slice(0, 10);
  const from = win === 1 ? new Date(Date.parse(today) - 86400000).toISOString() : dayRange(today, win)[0];
  // Daily rows span this window and the one before it plus a day, since the
  // change badges compare complete days only (today left out).
  const daily = useMetricBundle(DAILY, win === 1 ? new Date(Date.parse(today) - 2 * 86400000).toISOString() : dayRange(today, win * 2 + 1)[0], today);
  const totals = useMetricBundle(WINDOW, from, today);
  // Whole-window aggregates keep KPI comparisons rolling when the chart grid is floored.
  const previous = useMetricBundle(WINDOW, win === 1 ? new Date(Date.parse(from) - 86400000).toISOString() : from, from, win === 1);

  // Publish the bundles together after refresh, so fresh data never meets stale totals.
  const [shown, setShown] = React.useState({ daily: daily.data, totals: totals.data, previous: previous.data });
  const settled = !daily.loading && !totals.loading && !daily.refreshing && !totals.refreshing && !previous.loading && !previous.refreshing;
  if (settled && (shown.daily !== daily.data || shown.totals !== totals.data || shown.previous !== previous.data)) {
    setShown({ daily: daily.data, totals: totals.data, previous: previous.data });
  }

  const input: UsageInput | null = React.useMemo(() => {
    if (!shown.daily && !shown.totals) return null;
    return {
      daily: (shown.daily?.ai_usage_daily ?? []) as AiUsageDailyRow[],
      mealsDaily: (shown.daily?.ai_meals_daily ?? []) as AiMealsDailyRow[],
      window: (shown.totals?.ai_model_window ?? []) as AiModelUsageRow[],
      mealWindow: ((shown.totals?.ai_meal_window ?? []) as AiMealsRow[])[0],
      previousWindow: win === 1 ? (shown.previous?.ai_model_window ?? []) as AiModelUsageRow[] : undefined,
      previousMealWindow: win === 1 ? ((shown.previous?.ai_meal_window ?? []) as AiMealsRow[])[0] : undefined,
      to: today,
      win,
    };
  }, [shown, today, win]);
  const models = React.useMemo(() => (input ? modelsOf(input) : []), [input]);
  const summary = React.useMemo(() => (input ? summarize(input, models) : null), [input, models]);
  const dailyError = daily.error ?? daily.errors.ai_usage_daily;
  const mealDailyError = daily.error ?? daily.errors.ai_meals_daily;
  const totalsError = totals.error ?? totals.errors.ai_model_window;
  const mealTotalsError = totals.error ?? totals.errors.ai_meal_window;
  const error = dailyError ?? mealDailyError ?? totalsError ?? mealTotalsError ?? (win === 1 ? previous.error ?? previous.errors.ai_model_window ?? previous.errors.ai_meal_window : null);
  const retry = () => { setAsOf(new Date().toISOString()); daily.refresh(); totals.refresh(); previous.refresh(); };
  useRefocus(retry);

  if (daily.loading || totals.loading || previous.loading) return <PageSkeleton title="AI" charts={2} cells={5} />;
  const unit = win === 1 ? "24h" : `${win}d`;
  const change = (kpi: Kpi, goodUp: boolean, points = false) => <Change change={delta(kpi.cur, kpi.prev, points)} goodUp={goodUp} vs={win === 1 ? "vs prior 24 h" : `vs prior ${unit}`} title={win === 1 ? "Rolling last 24 hours vs preceding 24 hours" : `Last ${unit} of complete days vs the ${unit} before`} />;
  const used = summary?.models.filter((m) => m.calls > 0) ?? [];
  const calls = used.reduce((n, m) => n + m.calls, 0);
  const slowest = used.filter((m) => m.p95 != null).sort((x, y) => y.p95! - x.p95!)[0];
  const tabs: MetricTab[] = summary ? [
    { key: "spend", label: "Spend", value: usd(summary.spend.value), change: change(summary.spend, false) },
    { key: "perK", label: "Cost / 1k meals", value: usd(summary.perKMeals.value), change: change(summary.perKMeals, false), title: summary.mealP95 == null ? undefined : `p95 meal ${usd(summary.mealP95)}` },
    { key: "perMeal", label: "Calls per meal", value: summary.callsPerMeal == null ? "—" : decimal(summary.callsPerMeal) },
    { key: "errorRate", label: "Error rate", value: calls ? pct(used.reduce((n, m) => n + m.errors, 0) / calls) : "—", title: "Failed calls over all calls in the window" },
    { key: "cacheRate", label: "Cache hit", value: pct(summary.cacheRate.value, 0), change: change(summary.cacheRate, true, true) },
    { key: "latency", label: "Slowest p95", value: slowest ? ms(slowest.p95) : "—", title: slowest ? `${slowest.meta.label}, p95 over raw calls. The chart draws p95 solid and p99 dashed.` : undefined },
    { key: "fallbackRate", label: "Fallback rate", value: calls ? pct(used.reduce((n, m) => n + m.fallbacks, 0) / calls) : "—", title: "Calls that fell back to another model" },
  ] : [];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="AI usage" window={unit} onWindow={(v) => setWin((v === "24h" ? 1 : Number.parseInt(v, 10)) as WindowDays)} refreshing={daily.refreshing || totals.refreshing || previous.refreshing} onRefresh={retry} />

      {!input && error ? <MetricSection title="AI usage" error={error} retry={retry} /> : null}
      {input && summary ? <>
        {error ? <MetricSection title="Summary" error={error} retry={retry} /> : null}
        <MetricTabs tabs={tabs} value={tab} onChange={(v) => setTab(v as AiTrendMetric)} aside={totalsError ? <MetricSection title="Cost vs latency" error={totalsError} retry={retry} /> : <CostLatency compact models={summary.models} />}>
          {dailyError || mealDailyError ? <MetricSection title="Usage" error={dailyError ?? mealDailyError} retry={retry} /> : <AiTrend input={input} models={models} metric={tab} />}
        </MetricTabs>
        {totalsError ? null : <ModelTable models={summary.models} unit={unit === "24h" ? "24h" : `${win} days`} />}
        {!error && models.length === 0 && <p className="text-sm text-muted-foreground">No AI calls were recorded in this window.</p>}
        {!error && <footer className="flex flex-wrap gap-x-6 gap-y-1 text-xs leading-5 text-[var(--console-faint)]">
          <span>Cost is priced by Kallo from provider token counts. Cost per meal covers primary analyses only; shadow tests spent {usd(summary.shadowSpend)} this window.</span>
          <span>Unpriced calls: {int(summary.unpricedCalls)}</span>
          {summary.timedSince ? <span>Per-call latency recorded since {shortDate(summary.timedSince)}.</span> : null}
          {summary.hasTiming ? null : <span>No per-call latency recorded yet.</span>}
        </footer>}
      </> : null}
    </div>
  );
}
