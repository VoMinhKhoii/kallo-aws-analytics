"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendRow } from "@/lib/ai-usage/aggregate";
import { shortDate } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { ModelRail, useLocalFocus } from "./model-rail";
import { UsageTooltip } from "./usage-tooltip";

function lastValue(rows: TrendRow[], key: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (typeof v === "number") return v;
  }
  return null;
}

/** One full-width daily trend, one line per model, with its own model rail. */
export function TrendChart({
  title,
  rows,
  models,
  format,
  axis,
  action,
  dashed,
}: {
  title: string;
  rows: TrendRow[];
  models: ModelMeta[];
  format: (v: number) => string;
  axis: (v: number) => string;
  action?: React.ReactNode;
  /** Model keys drawn dashed, so the series do not rely on color alone. */
  dashed?: ReadonlySet<string>;
}) {
  const focus = useLocalFocus();
  const shown = models.filter((m) => rows.some((r) => typeof r[m.key] === "number"));
  const byKey = React.useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const since = rows[0]?.date;
  const rail = shown.map((meta) => {
    const v = lastValue(rows, meta.key);
    return { meta, value: v == null ? "—" : format(v), sub: "latest day" };
  });

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <span className="text-muted-foreground text-[12px]">{since ? `since ${shortDate(since)}` : ""}</span>
        </div>
        {action}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-[13px]">Nothing recorded in this window yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3 sm:flex-nowrap">
          <div className="h-[190px] min-w-0 flex-1">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--console-rule)" />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={36} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
                <YAxis tickFormatter={axis} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
                <Tooltip
                  cursor={{ stroke: "var(--console-muted)", strokeDasharray: "3 3" }}
                  content={(p) => <UsageTooltip active={p.active} payload={p.payload as never} label={p.label as string} models={byKey} format={format} />}
                />
                {shown.map((m) => (
                  <Line
                    key={m.key}
                    type="monotone"
                    dataKey={m.key}
                    stroke={m.color}
                    strokeOpacity={focus.opacity(m.key)}
                    strokeWidth={focus.active === m.key ? 2.5 : 1.75}
                    strokeDasharray={dashed?.has(m.key) ? "5 3" : undefined}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--card)" }}
                    connectNulls={false}
                    animationDuration={600}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ModelRail items={rail} focus={focus} />
        </div>
      )}
    </section>
  );
}
