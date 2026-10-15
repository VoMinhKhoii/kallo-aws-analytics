"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";

import { shortDate } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { SeriesRail } from "@/components/charts/series-rail";
import { ModelRail, useLocalFocus } from "./model-rail";
import { UsageTooltip } from "./usage-tooltip";

type TrendRow = { date: string } & Record<string, unknown>;

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
  seriesOnly = false,
}: {
  title: string;
  rows: TrendRow[];
  models: ModelMeta[];
  format: (v: number) => string;
  axis: (v: number) => string;
  action?: React.ReactNode;
  /** Model keys drawn dashed, so the series do not rely on color alone. */
  dashed?: ReadonlySet<string>;
  seriesOnly?: boolean;
}) {
  const focus = useLocalFocus();
  const [animate, setAnimate] = React.useState(true);
  const [hoveredRow, setHoveredRow] = React.useState<TrendRow | null>(null);
  const shown = models.filter((m) => rows.some((r) => typeof r[m.key] === "number" && Number.isFinite(r[m.key])));
  const byKey = React.useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const since = rows[0]?.date;
  const rail = shown.map((meta) => {
    const v = hoveredRow ? typeof hoveredRow[meta.key] === "number" ? hoveredRow[meta.key] as number : null : lastValue(rows, meta.key);
    return { meta, value: v == null ? "—" : format(v), sub: hoveredRow ? shortDate(hoveredRow.date.slice(0,10)) : "latest day" };
  });

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <span className="text-muted-foreground text-[12px]">{since ? `since ${shortDate(since.slice(0,10))}` : ""}</span>
        </div>
        {action}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground flex h-[190px] items-center justify-center text-[13px]">Nothing recorded in this window yet.</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="h-[190px] w-full min-w-0 sm:flex-1">
            <ResponsiveContainer>
              <LineChart data={rows} onMouseMove={state => setHoveredRow(state.activePayload?.[0]?.payload ?? null)} onMouseLeave={() => setHoveredRow(null)} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--console-rule)" />
                <XAxis dataKey="date" tickFormatter={v => shortDate(String(v).slice(0,10))} tickLine={false} axisLine={false} minTickGap={36} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
                <YAxis tickFormatter={axis} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
                <Tooltip
                  allowEscapeViewBox={{x: false, y: false}}
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
                    isAnimationActive={animate}
                    onAnimationEnd={() => setAnimate(false)}
                    animationDuration={600}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {seriesOnly ? <SeriesRail items={rail.map(({meta,value}) => ({...meta,value}))} focus={focus} /> : <ModelRail items={rail} focus={focus} />}
        </div>
      )}
    </section>
  );
}
