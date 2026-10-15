"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "@/components/charts/recharts";
import type { Kpi, Summary } from "@/lib/ai-usage/aggregate";
import { compact, delta, pct, usd } from "@/lib/ai-usage/format";
import { cn } from "@/lib/utils";

import { Cell } from "@/components/shared/kpi-cell";

type Good = "down" | "up";

function Sparkline({ values, color, format }: { values: number[]; color: string; format: (v: number) => string }) {
  const id = React.useId().replace(/:/g, "");
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-7 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "var(--console-muted)", strokeOpacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="tabular rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-lg">{format(Number(payload[0].value))}</div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${id})`} isAnimationActive={false} dot={false} activeDot={{ r: 2.5, strokeWidth: 0, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeltaPill({ kpi, good, unit, points }: { kpi: Kpi; good: Good; unit: string; points?: boolean }) {
  const d = delta(kpi.cur, kpi.prev, points);
  if (!d) return null;
  const better = good === "up" ? d.up : !d.up;
  const Icon = d.up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px]" title={`Last ${unit} of complete days vs the ${unit} before`}>
      <span className={cn("tabular inline-flex items-center gap-0.5 rounded px-1 py-px font-medium", better ? "bg-[var(--console-green)]/12 text-[var(--console-green)]" : "bg-[var(--console-amber)]/12 text-[var(--console-amber)]")}>
        <Icon className="size-3" />
        {d.text}
      </span>
      <span className="text-muted-foreground hidden 2xl:inline">vs prior {unit}</span>
    </span>
  );
}


export function KpiStrip({ summary, unit }: { summary: Summary; unit: string }) {
  const { spend, perKMeals, calls, cacheRate } = summary;
  return (
    <section aria-label="Summary" className="grid grid-cols-2 divide-border overflow-hidden rounded-xl border border-border bg-card md:grid-cols-5 md:divide-x [&>*]:border-border max-md:[&>*]:border-b">
      <Cell label="Spend" value={usd(spend.value)} delta={<DeltaPill kpi={spend} good="down" unit={unit} />} spark={<Sparkline values={spend.spark} color="var(--model-1)" format={usd} />} />
      <Cell label="Today so far" value={usd(summary.today.spend)} sub={`${compact(summary.today.meals)} meals analysed`} />
      <Cell
        label="Cost / 1k meals"
        value={usd(perKMeals.value)}
        delta={<DeltaPill kpi={perKMeals} good="down" unit={unit} />}
        sub={summary.mealP95 == null ? undefined : `p95 meal ${usd(summary.mealP95)}`}
        spark={<Sparkline values={perKMeals.spark} color="var(--model-2)" format={usd} />}
      />
      <Cell
        label="Calls"
        value={calls.value == null ? "—" : compact(calls.value)}
        delta={<DeltaPill kpi={calls} good="up" unit={unit} />}
        sub={summary.callsPerMeal == null ? undefined : `${summary.callsPerMeal.toFixed(1)} per meal`}
        spark={<Sparkline values={calls.spark} color="var(--console-muted)" format={compact} />}
      />
      <Cell label="Cache hit" value={pct(cacheRate.value, 0)} delta={<DeltaPill kpi={cacheRate} good="up" unit={unit} points />} spark={<Sparkline values={cacheRate.spark} color="var(--model-3)" format={(v) => pct(v, 0)} />} />
    </section>
  );
}
