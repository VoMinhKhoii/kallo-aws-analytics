"use client";
import * as React from "react";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatRow, Note, BarRow, type Stat } from "@/components/panels/common";
import { CHART } from "@/lib/metrics";
import { TrendCard } from "@/components/panels/trend";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useRange } from "@/components/range-context";
import { PageState, Loading, Failed } from "@/components/panels/states";
import { useSummary, useWeeks } from "@/lib/analytics-hooks";
import { AI_METRICS } from "@/lib/metrics";

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const num = (n: number) => n.toLocaleString("en-US");

export default function PipelinePage() {
  const { range } = useRange();
  const [metric, setMetric] = React.useState("ovr");
  const s = useSummary(range);
  const w = useWeeks();

  if (s.error || w.error) return <><PageHeader title="Pipeline overview" sub="Bridged AI telemetry" /><Failed error={s.error ?? w.error!} code={s.code ?? w.code} /></>;
  if (!s.data || !w.data) return <><PageHeader title="Pipeline overview" sub="Bridged AI telemetry" /><Loading /></>;

  const d = s.data.ai;
  const weeks = w.data.ai;
  const data = weeks.map((wk) => {
    if (wk.reqs == null) return { week: wk.w, value: metric === "vol" ? 0 : null };
    if (metric === "vol") return { week: wk.w, value: wk.reqs };
    if (metric === "acc") return { week: wk.w, value: wk.ing ? +((wk.acc! / wk.ing) * 100).toFixed(1) : null };
    if (metric === "ovr") return { week: wk.w, value: wk.choice ? +((wk.ovr! / wk.choice) * 100).toFixed(1) : null };
    return { week: wk.w, value: wk.ing ? +((wk.pool0! / wk.ing) * 100).toFixed(1) : null };
  });
  const firstWeek = Math.max(0, weeks.findIndex((wk) => wk.w >= d.from.slice(5)));
  const ovrPct = +pct(d.ovr, d.choice);

  const stageOf = (name: string): [string, number, number, number] =>
    d.stages.find((s) => s[0] === name) ?? [name, 0, 0, 0];
  const matching = stageOf("matching");
  const assembly = stageOf("assembly");
  const slowest = d.stages.reduce((a, s) => (s[2] > a[2] ? s : a), ["—", 0, 0, 0] as [string, number, number, number]);

  const stats: Stat[] = [
    { label: "Meals traced", value: num(d.meals), denom: `${d.from} → ${d.to}` },
    { label: "Meals w/ unresolved", value: pct(d.degraded, d.meals), unit: "%", denom: `${d.degraded} / ${d.meals} meals` },
    { label: "Ingredient verdicts", value: num(d.verdicts), denom: `across ${d.meals} meals` },
    {
      label: "Top-1 overturned", value: String(ovrPct), unit: "%", denom: `${d.ovr} / ${d.choice} with a choice`,
    },
    { label: "Zero-candidate", value: pct(d.pool[0], d.verdicts), unit: "%", denom: `${d.pool[0]} / ${d.verdicts} ingredients` },
    { label: "Matching p95", value: (d.matchP95 / 1000).toFixed(1), unit: "s", denom: `p50 ${(matching[1] / 1000).toFixed(1)}s · n=${matching[3]}` },
  ];

  const verdicts = [
    { label: "accepted", n: d.acc, color: CHART[1] },
    { label: "unmatched", n: d.unm, color: CHART[2] },
    { label: "rejected", n: d.rej, color: CHART[3] },
    { label: "missing", n: d.mis, color: CHART[5] },
  ];
  const noChoice = d.acc - d.choice, kept = d.choice - d.ovr;

  const recorded = [
    { name: "no reason recorded (null)", value: d.reasons.nul, fill: CHART[2] },
    { name: 'literal "none"', value: d.reasons.none, fill: CHART[5] },
    { name: "category mismatch (free text)", value: d.reasons.cat, fill: CHART[1] },
    { name: "other literal strings", value: d.reasons.other, fill: CHART[3] },
  ].filter((s) => s.value > 0);
  const cause = [
    { name: "no candidates retrieved — corpus gap", value: d.pool[0], fill: CHART[3] },
    { name: "candidates existed, adjudicator declined", value: d.reasons.n - d.pool[0], fill: CHART[1] },
  ].filter((s) => s.value > 0);

  const stageMax = Math.max(0, ...d.stages.map((s) => s[2]));
  const stageData = d.stages.map(([name, p50, p95, n]) => ({ name, p50, p95, n }));
  const stageConfig: ChartConfig = { p50: { label: "p50", color: CHART[4] }, p95: { label: "p95", color: CHART[4] } };
  const pieConfig: ChartConfig = { value: { label: "verdicts" } };

  return (
    <>
      <PageHeader
        title="Pipeline overview"
        sub={<>Bridged AI telemetry · {d.from} → {d.to} · {num(d.verdicts)} ingredient verdicts across {num(d.meals)} traced meals.</>}
      />
      <StatRow stats={stats} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.05fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Adjudication outcomes</CardTitle>
              <CardDescription className="mt-1">n={num(d.verdicts)} verdicts in range</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {verdicts.map((v) => (
                <span key={v.label} style={{ width: `${Math.max(0.6, (v.n / d.verdicts) * 100)}%`, background: v.color }} />
              ))}
            </div>
            <div>
              {verdicts.map((v) => (
                <div key={v.label} className="flex items-center gap-2.5 border-b py-1.5 last:border-0">
                  <span className="size-2.5 rounded-[3px]" style={{ background: v.color }} />
                  <span className="text-[13px]">{v.label}</span>
                  <span className="tabular text-muted-foreground ml-auto text-xs">{num(v.n)}</span>
                  <span className="tabular w-12 text-right text-xs">{pct(v.n, d.verdicts)}%</span>
                </div>
              ))}
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                Within the {num(d.acc)} accepted — did the model keep rank 1?
              </p>
              <div className="flex h-6 gap-0.5 overflow-hidden rounded-md">
                <span style={{ width: `${pct(noChoice, d.acc)}%`, background: CHART[5] }} />
                <span style={{ width: `${pct(kept, d.acc)}%`, background: CHART[1] }} />
                <span style={{ width: `${pct(d.ovr, d.acc)}%`, background: CHART[3] }} />
              </div>
              <div className="tabular mt-1.5 grid grid-cols-3 gap-1 text-[10px] leading-tight">
                <span className="text-muted-foreground">{noChoice}<br />pool of 1<br />no choice</span>
                <span className="text-muted-foreground">{kept}<br />kept rank 1<br />of {d.choice} with a choice</span>
                <span className="text-[var(--chart-3)]">{d.ovr}<br />overturned<br /><b>{ovrPct}% of {d.choice}</b></span>
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">Overturn rate by candidate pool size</p>
              <BarRow label="pool of 1" n="0.0%" sub={`0 / ${noChoice}`} w="0%" color={CHART[5]} labelWidth="w-24" />
              <BarRow label="pool of 2" n={`${pct(d.o2, d.a2)}%`} sub={`${d.o2} / ${d.a2}`} w={`${d.a2 ? (d.o2 / d.a2) * 100 : 0}%`} color={CHART[2]} labelWidth="w-24" />
              <BarRow label="pool of 3" n={`${pct(d.o3, d.a3)}%`} sub={`${d.o3} / ${d.a3}`} w={`${d.a3 ? (d.o3 / d.a3) * 100 : 0}%`} color={CHART[3]} labelWidth="w-24" />
            </div>
          </CardContent>
          <CardFooter>
            Overturn is impossible with one candidate, so single-candidate acceptances are excluded from the headline rate.{" "}
            {d.o2 === 0
              ? `In this range no two-candidate pool was overturned at all (0 of ${d.a2}); every overturn came from a full pool of three.`
              : "Rate rises with pool size — the model uses the choice it is given."}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Why the other {d.reasons.n} did not resolve</CardTitle>
              <CardDescription className="mt-1">rejected {d.rej} · unmatched {d.unm} · missing {d.mis}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "rejectReason as recorded", slices: recorded, center: d.reasons.nul, sub: `null of ${d.reasons.n}` },
                { title: "cause derived from pool size", slices: cause, center: d.pool[0], sub: "no candidates" },
              ].map((p) => (
                <div key={p.title}>
                  <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">{p.title}</p>
                  <div className="relative mx-auto h-40 w-40">
                    <ChartContainer config={pieConfig} className="aspect-square h-40 w-40">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie data={p.slices} dataKey="value" nameKey="name" innerRadius={46} outerRadius={68} strokeWidth={2} stroke="var(--card)" isAnimationActive={false}>
                          {p.slices.map((s) => <Cell key={s.name} fill={s.fill} />)}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                      <p className="tabular text-lg leading-none font-semibold">{p.center}</p>
                      <p className="text-muted-foreground mt-0.5 max-w-[72px] text-[9px] leading-tight">{p.sub}</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {p.slices.map((s) => (
                      <div key={s.name} className="flex items-start gap-2">
                        <span className="mt-1 size-2.5 shrink-0 rounded-[3px]" style={{ background: s.fill }} />
                        <span className="text-[11px] leading-snug">{s.name}</span>
                        <span className="tabular text-muted-foreground ml-auto shrink-0 text-[10px]">
                          {s.value} · {pct(s.value, p.slices.reduce((a, x) => a + x.value, 0))}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Note>
                <b className="text-[var(--chart-2)]">{pct(d.reasons.nul, d.reasons.n)}% of non-resolutions in this range carry no reason.</b>{" "}
                <code>rejectReason</code> is populated on {d.reasons.n - d.reasons.nul} of {d.reasons.n} verdicts. The cause pie beside it is
                derived from pool size, not from the field — it is the only reliable split available today.
              </Note>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3">
        <TrendCard
          title="Weekly trend"
          description="Full history, selected range shaded"
          metrics={AI_METRICS}
          metric={metric}
          onMetric={setMetric}
          data={data}
          firstWeek={firstWeek}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Stage duration</CardTitle>
              <CardDescription className="mt-1">ms · p50 → p95, recomputed over the range</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={stageConfig} className="aspect-auto h-52 w-full">
              <BarChart data={stageData} layout="vertical" margin={{ left: 4, right: 88 }}>
                <XAxis type="number" domain={[0, stageMax]} hide />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={132} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${num(v as number)} ms`} />} />
                <Bar dataKey="p95" fill="color-mix(in oklab, var(--chart-4) 25%, white)" radius={3} barSize={11} isAnimationActive={false}>
                  <LabelList dataKey="p95" position="right" className="tabular fill-muted-foreground" fontSize={10} formatter={(v: number) => `p95 ${num(v)}`} />
                </Bar>
                <Bar dataKey="p50" fill={CHART[4]} radius={3} barSize={11} isAnimationActive={false}>
                  <LabelList dataKey="p50" position="right" className="tabular fill-muted-foreground" fontSize={10} formatter={(v: number) => `p50 ${num(v)}`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter>
            <>Slowest stage this range: <b>{slowest[0]}</b> at p95 <b>{num(slowest[2])} ms</b> against a p50 of{" "}
              <b>{num(slowest[1])}</b>. Assembly is pure arithmetic at p50 <b>{num(assembly[1])} ms</b>.
              {d.stageOutliers > 0 && (
                <> Excludes <b>{d.stageOutliers}</b> row{d.stageOutliers === 1 ? "" : "s"} with a recorded duration above
                10 min — wall-clock artifacts, not stage time.</>
              )}</>
          </CardFooter>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader>
            <div>
              <CardTitle>Where these numbers come from</CardTitle>
              <CardDescription className="mt-1">live dev Supabase · aggregated in Postgres</CardDescription>
            </div>
            <CardAction><Badge variant="outline">source</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] leading-relaxed">
            <p>Every panel is one <code>analytics.*</code> RPC that aggregates inside the database and returns a small JSON payload, so raw JSONB never crosses the wire.</p>
            <p>Results are cached server-side and de-duplicated across concurrent callers; every list call is paginated and hard-capped in SQL as well as in the route.</p>
            <p>Ranges are measured back from the latest day that has data, not from today, so a quiet database does not render every panel empty.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
