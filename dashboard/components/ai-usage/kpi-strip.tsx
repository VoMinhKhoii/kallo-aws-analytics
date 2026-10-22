"use client";

import type { Kpi, Summary } from "@/lib/ai-usage/aggregate";
import { compact, decimal, delta, pct, usd } from "@/lib/ai-usage/format";
import { plural } from '@/lib/traces-ui/graph';

import { Cell, Change } from "@/components/shared/kpi-cell";

type Good = "down" | "up";

function DeltaPill({ kpi, good, unit, points }: { kpi: Kpi; good: Good; unit: string; points?: boolean }) {
  return <Change change={delta(kpi.cur, kpi.prev, points)} goodUp={good === "up"} title={unit === "24h" ? "Rolling last 24 hours vs preceding 24 hours" : `Last ${unit} of complete days vs the ${unit} before`} />;
}


export function KpiStrip({ summary, unit }: { summary: Summary; unit: string }) {
  const { spend, perKMeals, calls, cacheRate } = summary;
  return (
    <section aria-label="Summary" className="grid grid-cols-2 divide-border overflow-hidden rounded-xl border border-border bg-card md:grid-cols-5 md:divide-x [&>*]:border-border max-md:[&>*]:border-b">
      <Cell label="Spend" value={usd(spend.value)} delta={<DeltaPill kpi={spend} good="down" unit={unit} />} />
      <Cell label={unit === "24h" ? "Meals analysed" : "Today so far"} value={unit === "24h" ? compact(summary.mealCount) : usd(summary.today.spend)} sub={unit === "24h" ? "Rolling last 24 hours" : `${plural(summary.today.meals, 'meal')} analysed`} />
      <Cell
        label="Cost / 1k meals"
        value={usd(perKMeals.value)}
        delta={<DeltaPill kpi={perKMeals} good="down" unit={unit} />}
        sub={summary.mealP95 == null ? undefined : `p95 meal ${usd(summary.mealP95)}`}
      />
      <Cell
        label="Calls"
        value={calls.value == null ? "—" : compact(calls.value)}
        delta={<DeltaPill kpi={calls} good="up" unit={unit} />}
        sub={summary.callsPerMeal == null ? undefined : `${decimal(summary.callsPerMeal)} per meal`}
      />
      <Cell label="Cache hit" value={pct(cacheRate.value, 0)} delta={<DeltaPill kpi={cacheRate} good="up" unit={unit} points />} />
    </section>
  );
}
