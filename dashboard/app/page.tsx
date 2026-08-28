"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatRow, Note, BarRow, type Stat } from "@/components/panels/common";
import { TrendCard } from "@/components/panels/trend";
import { PageState, Loading, Failed } from "@/components/panels/states";
import { useRange } from "@/components/range-context";
import { useSummary, useWeeks } from "@/lib/analytics-hooks";
import { APP_METRICS, CHART } from "@/lib/metrics";

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const num = (n: number) => n.toLocaleString("en-US");

const APP_IDX: Record<string, number> = { users: 1, meals: 2, signups: 3, reqs: 4 };

export default function AppMetricsPage() {
  const { range } = useRange();
  const [metric, setMetric] = React.useState("meals");
  const s = useSummary(range);
  const w = useWeeks();

  if (s.error || w.error) return <><PageHeader title="App metrics" sub="Product telemetry" /><Failed error={s.error ?? w.error!} code={s.code ?? w.code} /></>;
  if (!s.data || !w.data) return <><PageHeader title="App metrics" sub="Product telemetry" /><Loading /></>;

  const d = s.data.app, all = s.data;
  const weeks = w.data.app;

  const data = weeks.map((row) => {
    const week = row[0] as string;
    if (metric === "errpct") {
      const n = row[4];
      return { week, value: n ? +(((row[5] as number) / n) * 100).toFixed(1) : null };
    }
    const v = row[APP_IDX[metric]];
    return { week, value: v == null ? 0 : (v as number) };
  });
  const firstWeek = weeks.findIndex((row) => (row[0] as string) >= d.from.slice(5));

  const errPct = +pct(d.err, d.reqs);
  const heavyShare = d.meals ? pct(d.heavyTwo, d.meals) : "0.0";

  const stats: Stat[] = [
    { label: "New signups", value: num(d.newUsers), denom: `of ${d.registered} registered all-time` },
    { label: "Active users", value: num(d.active), denom: `of ${d.everLogged} who ever logged a meal` },
    { label: "Meals logged", value: num(d.meals), denom: `${num(d.items)} ingredients` },
    { label: "Meals / active user", value: d.active ? (d.meals / d.active).toFixed(1) : "—", denom: `mean across ${d.active} users` },
    { label: "Pipeline requests", value: num(d.reqs), denom: `${d.ok} success · ${d.pend} pending` },
    { label: "Error rate", value: String(errPct), unit: "%", denom: `${d.err} / ${d.reqs} requests` },
  ];

  const rel = [
    { label: "success", n: d.ok, color: CHART[1] },
    { label: "error", n: d.err, color: CHART[3] },
    { label: "pending", n: d.pend, color: CHART[5] },
  ];
  const wkMax = Math.max(...weeks.map((r) => (r[4] ? ((r[5] as number) / (r[4] as number)) * 100 : 0)), 1);
  const funnel = [
    { label: "Registered an account", n: d.registered, color: CHART[5] },
    { label: "Logged at least 1 meal", n: d.everLogged, color: CHART[1] },
    { label: "Active in selected range", n: d.active, color: CHART[3] },
  ];
  const concMax = Math.max(...d.conc.map(([, n]) => n), 1);

  return (
    <>
      <PageHeader
        title="App metrics"
        sub={<>Product telemetry · {d.from} → {d.to} · anchored to the latest day with data ({all.anchor}), not to today.</>}
      />
      <StatRow stats={stats} />

      <div className="mt-3">
        <TrendCard
          title="Weekly activity" description="Full history, selected range shaded"
          metrics={APP_METRICS} metric={metric} onMetric={setMetric}
          data={data} firstWeek={firstWeek < 0 ? 0 : firstWeek}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Adoption — and how concentrated the logging is</CardTitle>
              <CardDescription className="mt-1">{d.registered} registered accounts all-time</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              {funnel.map((f) => (
                <BarRow key={f.label} label={f.label} n={String(f.n)} sub={`· ${pct(f.n, d.registered)}%`}
                        w={`${d.registered ? (f.n / d.registered) * 100 : 0}%`} color={f.color} />
              ))}
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                Meals logged per user — all {d.everLogged} who ever logged
              </p>
              <div className="grid grid-cols-5 items-end gap-2" style={{ height: 92 }}>
                {d.conc.map(([label, n]) => (
                  <div key={label} className="flex h-full flex-col justify-end">
                    <span className="tabular text-muted-foreground mb-1 text-center text-[11px]">{n}</span>
                    <span className="block rounded-t"
                          style={{ height: `${(n / concMax) * 62 + 6}px`, background: label === "30+" ? CHART[3] : CHART[1] }} />
                    <span className="text-muted-foreground mt-1.5 text-center text-[10px]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <Note>
              <b className="text-[var(--chart-2)]">The two heaviest accounts logged {d.heavyTwo} of {d.meals} meals — {heavyShare}% of everything in range.</b>{" "}
              {d.registered - d.everLogged} of {d.registered} registered accounts never logged a meal. Every per-user average on this
              page is dominated by a handful of people; read totals, not means.
            </Note>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pipeline request reliability</CardTitle>
              <CardDescription className="mt-1">n={num(d.reqs)} requests in range · the only honest failure denominator</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {rel.map((r) => <span key={r.label} style={{ width: `${d.reqs ? Math.max(0.6, (r.n / d.reqs) * 100) : 0}%`, background: r.color }} />)}
            </div>
            <div>
              {rel.map((r) => (
                <div key={r.label} className="flex items-center gap-2.5 border-b py-1.5 last:border-0">
                  <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
                  <span className="text-[13px]">{r.label}</span>
                  <span className="tabular text-muted-foreground ml-auto text-xs">{num(r.n)}</span>
                  <span className="tabular w-12 text-right text-xs">{pct(r.n, d.reqs)}%</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                Error rate by week — where the failures actually were
              </p>
              <div className="flex items-end gap-1" style={{ height: 66 }}>
                {weeks.filter((r) => r[4] != null).map((r) => {
                  const e = ((r[5] as number) / (r[4] as number)) * 100;
                  return <span key={r[0] as string} title={`${r[0]}: ${r[5]} of ${r[4]}`} className="min-w-0 flex-1 rounded-sm"
                               style={{ height: `${Math.max(2, (e / wkMax) * 58)}px`,
                                        background: e > 20 ? CHART[3] : e > 0 ? CHART[2] : "var(--muted)" }} />;
                })}
              </div>
            </div>
            <Note>
              {d.pend > 0 && <><b>{d.pend} request{d.pend === 1 ? "" : "s"} in range never reached a terminal status.</b> Pending rows are
              neither success nor error and must not be folded into either. </>}
              Widen or narrow the range and this rate moves — failures cluster into incidents rather than spreading evenly, so a
              lifetime figure describes the worst weeks rather than the current system.
            </Note>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Meal slot</CardTitle>
            <CardAction><Badge variant="outline">n={num(d.meals)}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {d.slots.length === 0 && <p className="text-muted-foreground text-xs">No meals in this range.</p>}
            {d.slots.map(([label, n]) => (
              <BarRow key={label} label={label} n={String(n)} sub={`· ${pct(n, d.meals)}%`}
                      w={`${(n / d.slots[0][1]) * 100}%`} color={label === d.slots[0][0] ? CHART[2] : CHART[1]} labelWidth="w-20" />
            ))}
          </CardContent>
          <CardFooter>
            <code>slot_override</code> — the column that records a user correcting the model&apos;s slot guess — is unpopulated, so this
            distribution is entirely the model&apos;s and never a user&apos;s.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entry mode</CardTitle>
            <CardAction><Badge variant="outline">n={num(d.meals)}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {d.modes.length === 0 && <p className="text-muted-foreground text-xs">No meals in this range.</p>}
            {d.modes.map(([label, n]) => (
              <BarRow key={label} label={label} n={String(n)} sub={`· ${pct(n, d.meals)}%`}
                      w={`${(n / d.modes[0][1]) * 100}%`} color={label === "precise" ? CHART[1] : CHART[2]} labelWidth="w-20" />
            ))}
          </CardContent>
          <CardFooter>
            <code>portion_factor</code>, the cheat-slider correction column, is unpopulated too. With no user-correction signal of any
            kind the plane can report disposition but never accuracy.
          </CardFooter>
        </Card>

        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle>Reading this page honestly</CardTitle>
            <CardAction><Badge variant="outline">beta scale</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs leading-relaxed">
            <p><span className="text-[var(--chart-3)]">→</span> <b>n = {d.registered} accounts, {d.everLogged} ever active.</b> Nothing here supports a cohort, a retention curve or a significance claim.</p>
            <p><span className="text-[var(--chart-3)]">→</span> <b>Logging is concentrated in a few accounts.</b> The distribution beside the funnel is the honest version of &ldquo;meals per user&rdquo;.</p>
            <p><span className="text-[var(--chart-3)]">→</span> <b>No user-correction signal exists.</b> <code>slot_override</code> and <code>portion_factor</code> are never written.</p>
            <p><span className="text-[var(--chart-3)]">→</span> <b>A complaint cannot be joined to a trace.</b> Neither <code>meals</code> nor <code>user_feedback</code> carries <code>pipeline_request_id</code>.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
