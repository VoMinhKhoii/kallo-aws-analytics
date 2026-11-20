"use client";

import * as React from "react";
import { mealTrendRows, trendRows, volumeRows, type UsageInput } from "@/lib/ai-usage/aggregate";
import { decimal, ms, msAxis, pct, usd } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { TrendChart } from "./trend-chart";

export type AiTrendMetric = "spend" | "perK" | "perMeal" | "errorRate" | "cacheRate" | "fallbackRate" | "latency";

const percent = { format: (v: number) => pct(v), axis: (v: number) => pct(v, 0), percent: true };
const single = (key: string, label: string): ModelMeta[] => [{ key, label, color: "var(--console-data)", id: key, vendor: "Other", role: "" }];

/** One line chart per AI tab: by model where the data is per model, one line where it is per meal. */
export function AiTrend({ input, models, metric }: { input: UsageInput; models: ModelMeta[]; metric: AiTrendMetric }) {
  const hourly = input.win === 1;
  const view = React.useMemo(() => {
    switch (metric) {
      case "spend": return { rows: volumeRows(input, "spend"), models, format: usd, axis: usd, percent: false, empty: "No spend recorded in this window yet." };
      case "perK": return { rows: mealTrendRows(input), models: single("perK", "Cost / 1k meals"), format: usd, axis: usd, percent: false, empty: "No priced meals in this window yet." };
      case "perMeal": return { rows: mealTrendRows(input), models: single("perMeal", "Calls per meal"), format: (v: number) => decimal(v), axis: (v: number) => decimal(v), percent: false, empty: "No meals in this window yet." };
      case "errorRate": return { rows: trendRows(input, "errorRate"), models, ...percent, empty: "No error-rate data in this window yet." };
      case "cacheRate": return { rows: trendRows(input, "cacheRate"), models, format: (v: number) => pct(v, 0), axis: (v: number) => pct(v, 0), percent: true, empty: "No cache data in this window yet." };
      case "fallbackRate": return { rows: trendRows(input, "fallbackRate"), models: models.filter((m) => m.vendor === "Anthropic"), ...percent, empty: "No fallback data in this window yet." };
      case "latency": {
        // p95 solid and p99 dashed in each model's colour, so both read on one chart.
        const p95 = trendRows(input, "p95"), p99 = trendRows(input, "p99");
        const rows = p95.map((r, i) => ({ ...r, ...Object.fromEntries(models.map((m) => [`${m.key}_p99`, p99[i]?.[m.key] ?? null])) }));
        const lines = models.flatMap((m) => [{ ...m, label: `${m.label} p95` }, { ...m, key: `${m.key}_p99`, label: `${m.label} p99` }]);
        return { rows, models: lines, format: ms, axis: msAxis, percent: false, empty: "No per-call latency in this window yet.", dashed: new Set(models.map((m) => `${m.key}_p99`)) };
      }
    }
  }, [input, models, metric]);
  return <TrendChart bare compact height={340} hourly={hourly} partialLast={metric === "spend"} durationAxis={metric === "latency"} percent={view.percent} title={metric} rows={view.rows} models={view.models} dashed={"dashed" in view ? view.dashed : undefined} format={view.format} axis={view.axis} emptyMessage={view.empty} />;
}
