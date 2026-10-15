"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type UsageInput, type VolumeMetric, type VolumeRow, volumeRows } from "@/lib/ai-usage/aggregate";
import { compact, pct, shortDate, usd } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { cn } from "@/lib/utils";
import { ModelRail, useLocalFocus } from "./model-rail";
import { UsageTooltip } from "./usage-tooltip";

const METRICS: { key: VolumeMetric; label: string; format: (v: number) => string; axis: (v: number) => string }[] = [
  { key: "spend", label: "Spend", format: usd, axis: (v) => (v === 0 ? "$0" : `$${v < 10 ? v.toFixed(2) : Math.round(v)}`) },
  { key: "calls", label: "Calls", format: compact, axis: compact },
  { key: "tokens", label: "Tokens", format: compact, axis: compact },
];

const columnTotal = (rows: VolumeRow[], key: string) => rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

export function UsageChart({ input, models }: { input: UsageInput; models: ModelMeta[] }) {
  const [metric, setMetric] = React.useState<VolumeMetric>("spend");
  const focus = useLocalFocus();
  const all = React.useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, volumeRows(input, m.key)])) as Record<VolumeMetric, VolumeRow[]>,
    [input],
  );
  const rows = all[metric];
  const def = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const byKey = React.useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const shown = models.filter((m) => rows.some((r) => typeof r[m.key] === "number"));
  const total = rows.reduce((s, r) => s + r.total, 0);
  // Average over complete days since the first one with data, not the empty
  // days before history begins.
  const complete = rows.slice(Math.max(rows.findIndex((r) => r.total > 0), 0)).filter((r) => !r.partial);
  const avg = complete.reduce((s, r) => s + r.total, 0) / Math.max(complete.length, 1);
  const rail = shown
    .map((meta) => ({ meta, sum: columnTotal(rows, meta.key) }))
    .sort((a, b) => b.sum - a.sum)
    .map(({ meta, sum }) => ({ meta, value: def.format(sum), sub: `${pct(total ? sum / total : 0, 0)} of ${def.label.toLowerCase()}` }));

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex min-w-56 flex-1 flex-col justify-center gap-0.5 px-4 py-2.5">
          <h2 className="text-[15px] font-semibold">Usage by model</h2>
          <p className="text-muted-foreground text-[12.5px]">Daily, UTC. Today is still filling (hatched).</p>
        </div>
        <div className="flex" role="tablist" aria-label="Metric">
          {METRICS.map((m) => {
            const on = m.key === metric;
            const t = all[m.key].reduce((s, r) => s + r.total, 0);
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setMetric(m.key)}
                className={cn("relative flex min-w-28 flex-col justify-center gap-1 border-l border-border px-4 py-2 text-left transition-colors", on ? "bg-[var(--console-surface)]" : "hover:bg-[var(--console-surface)]/50")}
              >
                {on ? <span className="absolute inset-x-0 top-0 h-0.5 bg-foreground" /> : null}
                <span className="text-muted-foreground text-[11.5px]">{m.label}</span>
                <span className="tabular text-[20px] leading-none font-medium">{m.format(t)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 px-2 py-3 sm:flex-nowrap sm:pr-4">
        <div className="h-[230px] min-w-0 flex-1">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={rows.length <= 7 ? "28%" : "14%"} onMouseLeave={() => focus.setHovered(null)}>
              <defs>
                {shown.map((m) => (
                  <pattern key={m.key} id={`hatch-${m.key}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="5" height="5" fill={m.color} fillOpacity={0.25} />
                    <line x1="0" y1="0" x2="0" y2="5" stroke={m.color} strokeWidth={2} />
                  </pattern>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--console-rule)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={def.axis} tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--console-ink)", fillOpacity: 0.05 }}
                content={(p) => (
                  <UsageTooltip active={p.active} payload={p.payload as never} label={p.label as string} models={byKey} format={def.format} showTotal note={(row) => (row.partial ? "so far" : null)} />
                )}
              />
              {avg > 0 ? (
                <ReferenceLine y={avg} stroke="var(--console-muted)" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: `avg ${def.format(avg)}`, position: "insideTopRight", fill: "var(--console-muted)", fontSize: 11 }} />
              ) : null}
              {shown.map((m) => (
                <Bar key={m.key} dataKey={m.key} stackId="v" isAnimationActive animationDuration={500} onMouseEnter={() => focus.setHovered(m.key)}>
                  {rows.map((r) => (
                    <Cell key={r.date} fill={r.partial ? `url(#hatch-${m.key})` : m.color} fillOpacity={focus.opacity(m.key)} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ModelRail items={rail} focus={focus} />
      </div>
    </section>
  );
}
