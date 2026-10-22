"use client";

import * as React from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/recharts";

import { observedRows, timeTicks, numericAxis, lastObservation, durationTicks } from "@/lib/ai-usage/chart-data";
import { shortDate, msAxis } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { SeriesRail } from "@/components/charts/series-rail";
import { ModelRail, useLocalFocus } from "./model-rail";
import { UsageTooltip } from "./usage-tooltip";

type TrendRow = { date: string } & Record<string, unknown>;

/** One full-width daily trend, one line per model, with its own model rail. */
export function TrendChart({
  title, subtitle,
  rows: inputRows,
  models,
  format,
  axis,
  action,
  dashed,
  seriesOnly = false,
  bars = false,
  hourly = false,
  partialLast = hourly, stacked = false, step = false, integer = false, totals = false, windowLabel, durationAxis = false, percent = false, seriesSubs = {}, note, compact = false, height = 190,
  emptyMessage = "Nothing recorded in this window yet.",
}: {
  title: string;
  subtitle?: string;
  rows: TrendRow[];
  models: ModelMeta[];
  format: (v: number) => string;
  axis: (v: number) => string;
  action?: React.ReactNode;
  /** Model keys drawn dashed, so the series do not rely on color alone. */
  dashed?: ReadonlySet<string>;
  seriesOnly?: boolean;
  bars?: boolean;
  hourly?: boolean;
  partialLast?: boolean; stacked?: boolean; step?: boolean; integer?: boolean; totals?: boolean; windowLabel?: string; durationAxis?: boolean;
  percent?: boolean; seriesSubs?: Record<string,string>; note?: React.ReactNode;
  /** Legend in the header instead of a rail, so the chart can sit in a column. */
  compact?: boolean; height?: number;
  emptyMessage?: string;
}) {
  const rows = observedRows(inputRows, models.map(m => m.key), !hourly);
  const ticks = timeTicks(rows, hourly);
  const hatchId = React.useId().replace(/:/g, "");
  const today = new Date().toISOString().slice(0, 10);
  const focus = useLocalFocus();
  const [animate, setAnimate] = React.useState(true);
  const [hoveredRow, setHoveredRow] = React.useState<TrendRow | null>(null);
  const shown = models.filter((m) => rows.some((r) => typeof r[m.key] === "number" && Number.isFinite(r[m.key])));
  const byKey = React.useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const since = rows[0]?.date;
  const numeric = numericAxis(stacked ? rows.map(r=>({...r,__total:shown.reduce((n,m)=>n+(typeof r[m.key]==='number'?r[m.key] as number:0),0)})) : rows, stacked ? ['__total'] : shown.map(m => m.key), percent, integer || bars);
  const duration = durationAxis ? durationTicks(rows.flatMap(r => shown.map(m => typeof r[m.key] === 'number' ? r[m.key] as number : 0))) : null;
  const axisFormat = duration ? (v: number) => msAxis(v, duration.at(-1)!) : axis;
  const rail = shown.map((meta) => {
    const last = lastObservation(rows, meta.key);
    const v = hoveredRow ? typeof hoveredRow[meta.key] === "number" ? hoveredRow[meta.key] as number : null : totals ? rows.reduce((sum,row)=>sum+(typeof row[meta.key]==='number'?row[meta.key] as number:0),0) : last.value;
    return { meta, value: v == null ? "—" : format(v), sub: hoveredRow ? shortDate(hoveredRow.date.slice(0,10)) : totals ? (seriesSubs[meta.key]??windowLabel??`${inputRows.length}d`) : last.stale ? `last seen ${shortDate(last.date!.slice(0,10))}${last.date!.includes("T") ? ` ${last.date!.slice(11,16)} UTC` : ""}` : (seriesSubs[meta.key]??"latest") };
  });

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-muted-foreground text-xs">{subtitle ?? (since ? `since ${shortDate(since.slice(0,10))}` : "")}</span>
        </div>
        {action}
      </div>
      {compact && shown.length > 0 && <div className="mb-2">{seriesOnly ? <SeriesRail inline items={rail.map(({meta,value,sub}) => ({...meta,value,sub}))} focus={focus} /> : <ModelRail inline items={rail} focus={focus} />}</div>}
      {note&&<p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      {shown.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{emptyMessage}</p>
      ) : (
        <div className={compact ? "flex flex-1 flex-col" : "mt-auto flex flex-col gap-4 sm:flex-row"}>
          {/* In a stretched card the compact plot grows to the card's height instead of leaving a band. */}
          <div className={compact ? "w-full min-w-0 flex-1" : "w-full min-w-0 sm:flex-1"} style={compact ? { minHeight: height } : { height }}>
            <ResponsiveContainer>
              <ComposedChart barGap={stacked?undefined:"-100%"} data={rows} onMouseMove={state => setHoveredRow(state.activePayload?.[0]?.payload ?? null)} onMouseLeave={() => setHoveredRow(null)} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                {bars && <defs>{shown.map(m => <pattern key={m.key} id={`${hatchId}-${m.key}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill={m.color} fillOpacity={0.25} /><line x1="0" y1="0" x2="0" y2="5" stroke={m.color} strokeWidth={2} /></pattern>)}</defs>}
                <CartesianGrid vertical={false} stroke="var(--console-rule)" />
                <XAxis dataKey="date" ticks={ticks} tickFormatter={v => hourly ? String(v).slice(11, 16) : shortDate(String(v).slice(0,10))} tickLine={false} axisLine={false} minTickGap={36} tick={{ fill: "var(--console-muted)", fontSize: 12 }} />
                <YAxis allowDecimals={!bars&&!integer} domain={duration?[0,duration.at(-1)!]:numeric.domain} allowDataOverflow={percent} ticks={duration??numeric.ticks} tickFormatter={axisFormat} tickLine={false} axisLine={false} width={64} tick={({x, y, payload}) => <text x={Number(x) - 8} y={y} textAnchor="end" dominantBaseline="central" fill="var(--console-muted)" fontSize={12}>{axisFormat(Number(payload.value))}</text>} />
                <Tooltip
                  allowEscapeViewBox={{x: false, y: false}}
                  cursor={{ stroke: "var(--console-muted)", strokeDasharray: "3 3" }}
                  content={(p) => <UsageTooltip active={p.active} payload={p.payload as never} label={p.label as string} models={byKey} format={format} />}
                />
                {shown.map((m, index) => bars ? (
                  <Bar key={m.key} dataKey={m.key} stackId={stacked?"counts":undefined} maxBarSize={stacked||index === 0 ? 36 : 14} fill={m.color} fillOpacity={focus.opacity(m.key)} isAnimationActive={animate} onAnimationEnd={() => setAnimate(false)} animationDuration={600}>
                    {rows.map(row => <Cell key={row.date} fill={(hourly ? partialLast && row.date===rows.at(-1)?.date && row.date.slice(0,10)===today : row.date.slice(0,10)===today) ? `url(#${hatchId}-${m.key})` : m.color} />)}
                  </Bar>
                ) : (
                  <Line
                    key={m.key}
                    type={step?"stepBefore":"linear"}
                    dataKey={m.key}
                    stroke={m.color}
                    strokeOpacity={focus.opacity(m.key)}
                    strokeWidth={focus.active === m.key ? 2.5 : 1.75}
                    strokeDasharray={dashed?.has(m.key) ? "5 3" : undefined}
                    // A reading with no neighbour draws no line segment, so mark it with a dot.
                    dot={({ cx, cy, index, key }: { cx?: number; cy?: number; index: number; key?: React.Key }) =>
                      isolated(rows, m.key, index) && cx != null && cy != null
                        ? <circle key={key} cx={cx} cy={cy} r={3} fill={m.color} fillOpacity={focus.opacity(m.key)} />
                        : <g key={key} />}
                    activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--card)" }}
                    connectNulls={false}
                    isAnimationActive={animate}
                    onAnimationEnd={() => setAnimate(false)}
                    animationDuration={600}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {compact ? null : seriesOnly ? <SeriesRail items={rail.map(({meta,value,sub}) => ({...meta,value,sub}))} focus={focus} /> : <ModelRail items={rail} focus={focus} />}
        </div>
      )}
    </section>
  );
}

function isolated(rows:TrendRow[],key:string,i:number) {
  const has=(j:number)=>typeof rows[j]?.[key]==='number';
  return has(i)&&!has(i-1)&&!has(i+1);
}
