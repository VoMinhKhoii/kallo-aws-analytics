"use client";

import * as React from "react";
import { type TrendMetric, trendRows, type UsageInput } from "@/lib/ai-usage/aggregate";
import { ms, msAxis, pct } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { cn } from "@/lib/utils";
import { TrendChart } from "./trend-chart";

type Percentile = Extract<TrendMetric, "p95" | "p99">;

export function Trends({ input, models }: { input: UsageInput; models: ModelMeta[] }) {
  const [latency, setLatency] = React.useState<Percentile>("p95");
  const rows = React.useMemo(
    () => ({
      latency: trendRows(input, latency),
      errorRate: trendRows(input, "errorRate"),
      fallbackRate: trendRows(input, "fallbackRate"),
      cacheRate: trendRows(input, "cacheRate"),
    }),
    [input, latency],
  );
  // Claude is the only model with a fallback route; draw it dashed everywhere.
  const anthropic = React.useMemo(() => new Set(models.filter((m) => m.vendor === "Anthropic").map((m) => m.key)), [models]);
  const fallbackModels = React.useMemo(() => models.filter((m) => m.vendor === "Anthropic"), [models]);

  const toggle = (
    <div className="flex rounded-md bg-secondary p-0.5 text-[12px]" role="group" aria-label="Latency percentile">
      {(["p95", "p99"] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={latency === p}
          onClick={() => setLatency(p)}
          className={cn("tabular rounded px-2.5 py-0.5", latency === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {p}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <TrendChart hourly={input.win === 1} partialLast={false} title={`Latency ${latency}`} rows={rows.latency} models={models} dashed={anthropic} format={ms} axis={msAxis} emptyMessage="No per-call latency in this window yet." action={toggle} note={models.filter(m=>!rows.latency.some(r=>typeof r[m.key]==='number')&&rows.errorRate.some(r=>typeof r[m.key]==='number')).map(m=>`${m.label}: no per-call latency in this window.`).join(" ")} />
      <TrendChart hourly={input.win === 1} partialLast={false} emptyMessage="No error-rate data in this window yet." percent title="Error rate" rows={rows.errorRate} models={models} dashed={anthropic} format={(v) => pct(v)} axis={(v) => pct(v, 0)} />
      <TrendChart hourly={input.win === 1} partialLast={false} emptyMessage="No fallback data in this window yet." percent title="Fallback rate" rows={rows.fallbackRate} models={fallbackModels} dashed={anthropic} format={(v) => pct(v)} axis={(v) => pct(v, 0)} />
      <TrendChart hourly={input.win === 1} partialLast={false} emptyMessage="No cache data in this window yet." percent title="Cache hit" rows={rows.cacheRate} models={models} dashed={anthropic} format={(v) => pct(v, 0)} axis={(v) => pct(v, 0)} />
    </>
  );
}
