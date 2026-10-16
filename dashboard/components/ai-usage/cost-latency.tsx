"use client";

import { CartesianGrid, LabelList, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "@/components/charts/recharts";
import type { ModelSummary } from "@/lib/ai-usage/aggregate";
import { plural } from '@/lib/traces-ui/graph';
import { compact, ms, msAxis, pct, usd } from "@/lib/ai-usage/format";
import { ModelRail, useLocalFocus } from "./model-rail";

import { currencyAxis, durationTicks } from "@/lib/ai-usage/chart-data";

interface Point {
  x: number;
  y: number;
  z: number;
  label: string;
  m: ModelSummary;
}

type Placement = "right" | "above" | "below";

function PointTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const rows: [string, string][] = [
    ["$ / 1k calls", usd(p.m.perKCalls)],
    ["p95", ms(p.m.p95)],
    ["p99", ms(p.m.p99)],
    ["Calls", compact(p.m.calls)],
    ["Error rate", pct(p.m.errorRate)],
    ["Cache hit", pct(p.m.cacheRate, 0)],
  ];
  return (
    <div className="min-w-52 rounded-lg border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <span className="size-2 rounded-[2px]" style={{ background: p.m.meta.color }} />
        {p.m.meta.label}
      </div>
      <div className="grid gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-muted-foreground">{k}</span>
            <span className="tabular">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bubbles that sit close together get their labels above and below instead of beside. */
function placements(points: Point[], maxX: number, maxY: number): Map<string, Placement> {
  const out = new Map(points.map((p) => [p.m.meta.key, "right" as Placement]));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [a, b] = [points[i], points[j]];
      if (Math.abs(a.x - b.x) / maxX < 0.3 && Math.abs(a.y - b.y) / maxY < 0.2) {
        const [hi, lo] = a.y >= b.y ? [a, b] : [b, a];
        out.set(hi.m.meta.key, "above");
        out.set(lo.m.meta.key, "below");
      }
    }
  }
  return out;
}

/** Recharts wraps LabelList text; this draws the model name on one line. */
function BubbleLabel({ x, y, width, value, placement, opacity }: { x?: number; y?: number; width?: number; value?: string; placement: Placement; opacity: number }) {
  if (x == null || y == null || !value) return null;
  const r = (width ?? 24) / 2;
  const pos =
    placement === "right"
      ? { x: x + 2 * r + 8, y: y + r, anchor: "start" as const }
      : placement === "above"
        ? { x: x + r, y: y - 8, anchor: "middle" as const }
        : { x: x + r, y: y + 2 * r + 14, anchor: "middle" as const };
  return (
    <text x={pos.x} y={pos.y} textAnchor={pos.anchor} dominantBaseline="central" fontSize={12} fontWeight={500} fill="var(--console-ink)" opacity={opacity}>
      {value}
    </text>
  );
}

export function CostLatency({ models }: { models: ModelSummary[] }) {
  const focus = useLocalFocus();
  const points: Point[] = models
    .filter((m) => m.p95 != null && m.perKCalls != null)
    .map((m) => ({ x: m.perKCalls ?? 0, y: m.p95 ?? 0, z: m.calls, label: m.meta.label, m }));
  const currency = currencyAxis([Math.max(...points.map(p => p.x), .1) * 1.35]);
  const maxX = currency.domain[1];
  const ticks = durationTicks(points.map(p => p.y * 1.35));
  const maxY = ticks.at(-1)!;
  const place = placements(points, maxX, maxY);

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card">
      <div className="px-4 pt-3">
        <h2 className="text-[15px] font-semibold">Cost vs latency</h2>
        <p className="text-muted-foreground text-[12.5px]">$ / 1k calls against p95. Bubble size is call volume.</p>
      </div>
      {models.filter(m=>m.p95==null&&m.calls>0).map(m=><p key={m.meta.key} className="px-4 pt-2 text-xs text-muted-foreground">{m.meta.label}: no per-call latency in this window.</p>)}
      {points.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-[13px]">No per-call latency in this window yet.</p>
      ) : (
        <div className="flex flex-col gap-3 px-2 pt-1 pb-3 sm:flex-row sm:pr-4">
          <div className="h-[250px] w-full min-w-0 sm:flex-1">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 16, right: 28, bottom: 18, left: 4 }}>
                <CartesianGrid stroke="var(--console-rule)" />
                {points.length >= 2 && <ReferenceArea x1={0} x2={maxX / 2} y1={0} y2={maxY / 2} fill="var(--console-green)" fillOpacity={0.06} stroke="var(--console-green)" strokeOpacity={0.25} strokeDasharray="3 3" label={{ value: "cheaper · faster", position: "insideBottomLeft", fill: "var(--console-green)", fontSize: 11, opacity: 0.8 }} />}
                <XAxis type="number" dataKey="x" domain={currency.domain} ticks={currency.ticks} tickFormatter={currency.format} tickLine={false} axisLine={false} tick={{ fill: "var(--console-muted)", fontSize: 11 }} label={{ value: "$ / 1k calls", position: "insideBottom", offset: -12, fill: "var(--console-muted)", fontSize: 11 }} />
                <YAxis type="number" dataKey="y" domain={[0, maxY]} ticks={ticks} tickFormatter={v => msAxis(Number(v), maxY)} tickLine={false} axisLine={false} width={64} tick={{ fill: "var(--console-muted)", fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[220, 1400]} />
                <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "var(--console-muted)" }} content={(p) => <PointTooltip active={p.active} payload={p.payload as never} />} />
                {points.map((p) => {
                  const { key, color, label } = p.m.meta;
                  return (
                    <Scatter
                      key={key}
                      name={label}
                      data={[p]}
                      fill={color}
                      fillOpacity={0.85 * focus.opacity(key)}
                      stroke={color}
                      strokeOpacity={focus.opacity(key)}
                      strokeWidth={1.5}
                      onMouseEnter={() => focus.setHovered(key)}
                      onMouseLeave={() => focus.setHovered(null)}
                    >
                      <LabelList dataKey="label" content={<BubbleLabel placement={place.get(key) ?? "right"} opacity={focus.opacity(key)} />} />
                    </Scatter>
                  );
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <ModelRail
            focus={focus}
            items={[...points].sort((a, b) => a.x - b.x).map((p) => ({ meta: p.m.meta, value: `${usd(p.x)} / 1k`, sub: `p95 ${ms(p.m.p95)} · ${plural(p.z,'call')}` }))}
          />
        </div>
      )}
    </section>
  );
}
