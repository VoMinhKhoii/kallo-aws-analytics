"use client";

import * as React from "react";
import { CostLatency } from "@/components/ai-usage/cost-latency";
import { KpiStrip } from "@/components/ai-usage/kpi-strip";
import { Trends } from "@/components/ai-usage/trends";
import { UsageChart } from "@/components/ai-usage/usage-chart";
import { MetricState, RefreshButton } from "@/components/console/console";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AiMealsDailyRow, AiMealsRow, AiModelUsageRow, AiUsageDailyRow } from "@/app/lib/types";
import { dayRange, modelsOf, summarize, type UsageInput, type WindowDays } from "@/lib/ai-usage/aggregate";
import { int, shortDate, usd } from "@/lib/ai-usage/format";
import { useMetricBundle } from "@/lib/use-metric-bundle";

const WINDOWS: WindowDays[] = [7, 30, 90];
const DAILY = ["ai_usage_daily", "ai_meals_daily"] as const;
const WINDOW = ["ai_model_window", "ai_meal_window"] as const;

export default function AiPage() {
  const [win, setWin] = React.useState<WindowDays>(30);
  // Remount per window so both bundles load the new range together; a kept
  // bundle would otherwise mix the old range's rows into the new window.
  return <AiUsage key={win} win={win} setWin={setWin} />;
}

function AiUsage({ win, setWin }: { win: WindowDays; setWin: (win: WindowDays) => void }) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = dayRange(today, win)[0];
  // Daily rows span this window and the one before it, for the change badges.
  const daily = useMetricBundle(DAILY, dayRange(today, win * 2)[0], today);
  const totals = useMetricBundle(WINDOW, from, today);

  // A manual refresh reloads both bundles independently; show their data only
  // once neither is mid-refresh, so one fresh bundle never meets a stale one.
  const [shown, setShown] = React.useState({ daily: daily.data, totals: totals.data });
  if (!daily.refreshing && !totals.refreshing && (shown.daily !== daily.data || shown.totals !== totals.data)) {
    setShown({ daily: daily.data, totals: totals.data });
  }

  const input: UsageInput | null = React.useMemo(() => {
    if (!shown.daily || !shown.totals) return null;
    return {
      daily: (shown.daily.ai_usage_daily ?? []) as AiUsageDailyRow[],
      mealsDaily: (shown.daily.ai_meals_daily ?? []) as AiMealsDailyRow[],
      window: (shown.totals.ai_model_window ?? []) as AiModelUsageRow[],
      mealWindow: ((shown.totals.ai_meal_window ?? []) as AiMealsRow[])[0],
      to: today,
      win,
    };
  }, [shown, today, win]);
  const models = React.useMemo(() => (input ? modelsOf(input) : []), [input]);
  const summary = React.useMemo(() => (input ? summarize(input, models) : null), [input, models]);
  const error = daily.error ?? totals.error ?? Object.values({ ...daily.errors, ...totals.errors })[0] ?? null;

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-3 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">AI usage</h1>
          <p className="text-muted-foreground text-[13px]">Spend, latency and reliability per model · UTC days · cost priced by Kallo from provider token counts</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={String(win)} onValueChange={(v) => v && setWin(Number(v) as WindowDays)} aria-label="Window">
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w} value={String(w)} className="tabular px-3">
                {w}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <RefreshButton refreshing={daily.refreshing || totals.refreshing} onClick={() => { daily.refresh(); totals.refresh(); }} />
        </div>
      </header>

      <MetricState
        loading={daily.loading || totals.loading}
        error={error}
        empty={!summary || summary.models.length === 0}
        emptyMessage="No AI calls were recorded in this window."
      >
        {input && summary ? (
          <>
            <KpiStrip summary={summary} unit={`${win}d`} />
            <UsageChart input={input} models={models} />
            <CostLatency models={summary.models} />
            <Trends input={input} models={models} />
            <footer className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 px-1 text-[12px]">
              <span>Cost per meal covers primary analyses only; shadow tests spent {usd(summary.shadowSpend)} this window.</span>
              <span>Unpriced calls: {int(summary.unpricedCalls)}</span>
              {summary.timedSince ? <span>Per-call latency recorded since {shortDate(summary.timedSince)}.</span> : <span>No per-call latency recorded yet.</span>}
            </footer>
          </>
        ) : null}
      </MetricState>
    </div>
  );
}
