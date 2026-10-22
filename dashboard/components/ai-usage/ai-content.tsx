"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/shared/chart-skeleton";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import * as React from "react";
const CostLatency = dynamic(() => import("@/components/ai-usage/cost-latency").then(m => m.CostLatency), {ssr: false, loading: () => <ChartSkeleton height={234} />});
const KpiStrip = dynamic(() => import("@/components/ai-usage/kpi-strip").then(m => m.KpiStrip), {ssr: false, loading: () => <ChartSkeleton height={122} />});
const Trends = dynamic(() => import("@/components/ai-usage/trends").then(m => m.Trends), {ssr: false, loading: () => <ChartSkeleton height={936} />});
const ModelTable = dynamic(() => import("@/components/ai-usage/model-table").then(m => m.ModelTable), {ssr: false, loading: () => <ChartSkeleton height={160} />});
const UsageChart = dynamic(() => import("@/components/ai-usage/usage-chart").then(m => m.UsageChart), {ssr: false, loading: () => <ChartSkeleton height={330} />});
import { MetricSection } from "@/components/shared/metric-section";
import { RefreshButton } from "@/components/console/console";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AiMealsDailyRow, AiMealsRow, AiModelUsageRow, AiUsageDailyRow } from "@/app/lib/types";
import { dayRange, modelsOf, summarize, type UsageInput, type WindowDays } from "@/lib/ai-usage/aggregate";
import { int, pct, shortDate, usd } from "@/lib/ai-usage/format";
import { useRefocus } from "@/lib/use-refocus";
import { useMetricBundle } from "@/lib/use-metric-bundle";

const WINDOWS: WindowDays[] = [1, 7, 30];
const DAILY = ["ai_usage_daily", "ai_meals_daily"] as const;
const WINDOW = ["ai_model_window", "ai_meal_window"] as const;

export function AiUsage({ win, setWin }: { win: WindowDays; setWin: (win: WindowDays) => void }) {
  const [asOf, setAsOf] = React.useState(() => new Date().toISOString());
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

  if (daily.loading || totals.loading || previous.loading) return <PageSkeleton title="AI" charts={6} cells={5} />;
  // The line under the title: where the money went, then the model that failed most.
  const top = summary ? [...summary.models].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))[0] : undefined;
  const failing = summary ? [...summary.models].filter((m) => m.errors > 0).sort((a, b) => b.errorRate - a.errorRate)[0] : undefined;
  const finding = summary && summary.models.length
    ? `${usd(summary.spend.value)} spent ${win === 1 ? "in the last 24 hours" : `in the last ${win} days`}${top?.spend ? `, ${pct(top.share, 0)} of it on ${top.meta.label}` : ""}. ${!failing ? "No model call failed." : failing === top ? `It also failed most often, on ${pct(failing.errorRate)} of its calls.` : `${failing.meta.label} failed ${pct(failing.errorRate)} of its calls.`}`
    : `Spend, latency and reliability per model · ${win === 1 ? "rolling 24 hours" : "UTC days"}`;
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-3 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">AI usage</h1>
          <p className="text-muted-foreground text-[14px]">{finding}</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={String(win)} onValueChange={(v) => v && setWin(Number(v) as WindowDays)} aria-label="Window">
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w} value={String(w)} className="tabular px-3">
                {w === 1 ? "24h" : `${w}d`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <RefreshButton refreshing={daily.refreshing || totals.refreshing || previous.refreshing} onClick={retry} />
        </div>
      </header>

      {!input && error ? <MetricSection title="AI usage" error={error} retry={retry} /> : null}
      {input && summary ? <>
        {error ? <MetricSection title="Summary" error={error} retry={retry} /> : <KpiStrip summary={summary} unit={win === 1 ? "24h" : `${win}d`} />}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">{dailyError || mealDailyError ? <MetricSection card title="Usage" error={dailyError ?? mealDailyError} retry={retry} /> : <UsageChart input={input} models={models} />}</div>
          {totalsError ? <MetricSection card title="Cost vs latency" error={totalsError} retry={retry} /> : <CostLatency compact models={summary.models} />}
        </div>
        {totalsError ? null : <ModelTable models={summary.models} unit={win === 1 ? "24h" : `${win} days`} />}
        {dailyError ? <MetricSection card title="Trends" error={dailyError} retry={retry} /> : <div className="grid gap-3 lg:grid-cols-2"><Trends compact input={input} models={models} /></div>}
        {!error && models.length === 0 && <p className="text-sm text-muted-foreground">No AI calls were recorded in this window.</p>}
        {!error && <>
            <footer className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 px-1 text-[12px]">
              <span>Cost is priced by Kallo from provider token counts. Cost per meal covers primary analyses only; shadow tests spent {usd(summary.shadowSpend)} this window.</span>
              <span>Unpriced calls: {int(summary.unpricedCalls)}</span>
              {summary.timedSince ? <span>Per-call latency recorded since {shortDate(summary.timedSince)}.</span> : null}
              {summary.hasTiming ? null : <span>No per-call latency recorded yet.</span>}
            </footer>
        </>}
      </> : null}
    </div>
  );
}
