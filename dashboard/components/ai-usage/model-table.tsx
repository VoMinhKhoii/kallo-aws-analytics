"use client";

import type { ModelSummary } from "@/lib/ai-usage/aggregate";
import { int, ms, pct, usd } from "@/lib/ai-usage/format";
import { ModelBadge } from "./model-badge";

const num = "px-4 py-2 text-right tabular whitespace-nowrap";

/** One row per model, most expensive first: the numbers the charts above are drawn from. */
export function ModelTable({ models, unit }: { models: ModelSummary[]; unit: string }) {
  const rows = [...models].filter((m) => m.calls > 0).sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0) || b.calls - a.calls);
  if (!rows.length) return null;
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card px-4 py-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
        <h2 className="text-sm font-semibold">Models</h2>
        <span className="text-muted-foreground text-xs">{unit === "24h" ? "Rolling 24 hours" : `Last ${unit}`} · percentiles over raw calls, most expensive first</span>
      </div>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-normal">Model</th>
              <th className="px-4 py-2 text-right font-normal">Calls</th>
              <th className="px-4 py-2 text-right font-normal">Spend</th>
              <th className="px-4 py-2 text-right font-normal">Share of spend</th>
              <th className="px-4 py-2 text-right font-normal">$ / 1k calls</th>
              <th className="px-4 py-2 text-right font-normal">p95</th>
              <th className="px-4 py-2 text-right font-normal">p99</th>
              <th className="px-4 py-2 text-right font-normal">Errors</th>
              <th className="px-4 py-2 text-right font-normal">Fallbacks</th>
              <th className="px-4 py-2 text-right font-normal">Cache hit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.meta.key} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <ModelBadge meta={m.meta} size={22} />
                    <span className="grid min-w-0 leading-tight">
                      <span className="truncate font-medium">{m.meta.label}</span>
                      {m.meta.role ? <span className="text-muted-foreground truncate text-xs">{m.meta.role}</span> : null}
                    </span>
                  </span>
                </td>
                <td className={num}>{int(m.calls)}</td>
                <td className={num}>{usd(m.spend)}</td>
                <td className={num}>
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-secondary" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${Math.round(m.share * 100)}%`, background: m.meta.color }} />
                    </span>
                    {pct(m.share, 0)}
                  </span>
                </td>
                <td className={num}>{usd(m.perKCalls)}</td>
                <td className={num}>{ms(m.p95)}</td>
                <td className={num}>{ms(m.p99)}</td>
                <td className={`${num} ${m.errors ? "mark-bad" : ""}`}>{pct(m.errorRate)}<span className="text-muted-foreground ml-1 text-xs">({int(m.errors)})</span></td>
                <td className={num}>{int(m.fallbacks)}</td>
                <td className={`${num} pr-4`}>{pct(m.cacheRate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
