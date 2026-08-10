"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PipelineControl, WeeklyInsight } from "./action-center";
import type {
  DashboardMetrics,
  FailureRow,
  LatencyRow,
  MealVolumeRow,
  RetentionRow,
  TokenCostRow,
} from "@/app/lib/types";

const COLORS = {
  green: "oklch(0.49 0.105 160)",
  greenLight: "oklch(0.69 0.105 160)",
  blue: "oklch(0.58 0.11 240)",
  amber: "oklch(0.68 0.13 75)",
  coral: "oklch(0.63 0.13 30)",
  slate: "oklch(0.51 0.025 220)",
};

const EMPTY_COPY = "No data yet — run the pipeline";

function dayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function Panel({
  id,
  title,
  subtitle,
  className = "",
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel min-w-0 p-5 sm:p-6 ${className}`} aria-labelledby={id}>
      <div className="mb-6">
        <h2 id={id} className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
        <p className="mt-1 max-w-[75ch] text-xs leading-5 text-[var(--ink-muted)]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-5 text-center ${compact ? "min-h-28" : "min-h-64"}`}>
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">{EMPTY_COPY}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Fresh aggregates appear after a successful run.</p>
      </div>
    </div>
  );
}

function ChartFrame({ children, height = 260 }: { children: React.ReactNode; height?: number }) {
  return <div style={{ height }} className="min-w-0 w-full">{children}</div>;
}

function mergeMealVolume(rows: MealVolumeRow[]) {
  const byDate = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const item = byDate.get(row.date) ?? { date: row.date };
    item[row.meal_slot] = Number(item[row.meal_slot] ?? 0) + row.count;
    byDate.set(row.date, item);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function modeTotals(rows: MealVolumeRow[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.entry_mode, (totals.get(row.entry_mode) ?? 0) + row.count));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function mergeLatency(rows: LatencyRow[]) {
  const byDate = new Map<string, Record<string, string | number>>();
  rows.forEach((row) => {
    const item = byDate.get(row.date) ?? { date: row.date };
    item[`${row.model}_p50`] = row.p50_ms;
    item[`${row.model}_p95`] = row.p95_ms;
    byDate.set(row.date, item);
  });
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function failureTotals(rows: FailureRow[]) {
  const totals = new Map<string, { events: number; failures: number }>();
  rows.forEach((row) => {
    const current = totals.get(row.model) ?? { events: 0, failures: 0 };
    current.events += row.event_count;
    current.failures += row.failure_count;
    totals.set(row.model, current);
  });
  return [...totals.entries()].map(([model, values]) => ({
    model,
    rate: values.events ? values.failures / values.events : 0,
    ...values,
  }));
}

function mergeCosts(rows: TokenCostRow[]) {
  const byDate = new Map<string, Record<string, string | number>>();
  rows.forEach((row) => {
    const item = byDate.get(row.date) ?? { date: row.date };
    item[row.model] = Number(item[row.model] ?? 0) + row.cost_usd;
    byDate.set(row.date, item);
  });
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function EngagementPanel({ metrics }: { metrics: DashboardMetrics }) {
  const maxWeek = metrics.retention_cohorts.reduce((max, row) => Math.max(max, row.weeks_later), 0);
  const cohortWeeks = Array.from({ length: Math.min(9, maxWeek + 1) }, (_, index) => index);
  const cohorts = [...new Set(metrics.retention_cohorts.map((row) => row.cohort_week))].sort().slice(-8);
  const retentionLookup = new Map(
    metrics.retention_cohorts.map((row) => [`${row.cohort_week}:${row.weeks_later}`, row]),
  );

  return (
    <Panel
      id="engagement-title"
      title="Engagement and retention"
      subtitle="Active = logged a meal. WAU counts unique active users in the trailing seven calendar days; retention tracks later-week meal activity within Monday-based signup cohorts."
      className="lg:col-span-2"
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]">
        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--ink-muted)]">Daily and weekly active users</p>
          {metrics.dau_wau.length ? (
            <ChartFrame height={290}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.dau_wau} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid className="chart-grid" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={dayLabel} />
                  <Legend iconType="plainline" />
                  <Line type="monotone" dataKey="dau" name="DAU" stroke={COLORS.green} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="wau" name="WAU" stroke={COLORS.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : <EmptyState />}
        </div>
        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold text-[var(--ink-muted)]">Weekly cohort retention</p>
          {cohorts.length ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="w-full min-w-[470px] border-collapse text-xs">
                <thead className="bg-[var(--surface-muted)] text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Cohort</th>
                    <th className="px-2 py-2.5 text-right font-medium">Size</th>
                    {cohortWeeks.map((week) => <th key={week} className="px-2 py-2.5 text-center font-medium">W{week}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((cohort) => {
                    const cohortRows = metrics.retention_cohorts.filter((row) => row.cohort_week === cohort);
                    const size = cohortRows[0]?.cohort_size ?? 0;
                    return (
                      <tr key={cohort} className="border-t border-[var(--line)]">
                        <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-[var(--ink)]">{dayLabel(cohort)}</th>
                        <td className="px-2 py-2.5 text-right font-mono text-[var(--ink-muted)]">{size}</td>
                        {cohortWeeks.map((week) => {
                          const row = retentionLookup.get(`${cohort}:${week}`) as RetentionRow | undefined;
                          const rate = row?.retention_rate;
                          return (
                            <td key={week} className="p-1.5 text-center">
                              {rate === undefined ? (
                                <span className="text-[var(--line)]">-</span>
                              ) : (
                                <span
                                  className="block rounded-md px-1 py-1.5 font-mono font-semibold text-[var(--ink)]"
                                  style={{ background: `oklch(0.72 0.105 160 / ${0.12 + rate * 0.72})` }}
                                >
                                  {percent(rate)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState />}
        </div>
      </div>
    </Panel>
  );
}

function MealVolumePanel({ rows }: { rows: MealVolumeRow[] }) {
  const data = mergeMealVolume(rows);
  const slots = [...new Set(rows.map((row) => row.meal_slot))];
  const modes = modeTotals(rows);
  const palette = [COLORS.green, COLORS.blue, COLORS.amber, COLORS.coral, COLORS.slate];
  return (
    <Panel
      id="meal-volume-title"
      title="Meal-log volume"
      subtitle="Volume = meal records per UTC day, split by meal slot and entry mode."
    >
      {data.length ? (
        <>
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid className="chart-grid" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={dayLabel} />
                <Legend iconType="square" />
                {slots.map((slot, index) => (
                  <Bar key={slot} dataKey={slot} name={slot} stackId="slots" fill={palette[index % palette.length]} radius={index === slots.length - 1 ? [4, 4, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--line)] pt-4 sm:grid-cols-3">
            {modes.map(([mode, count]) => (
              <div key={mode}>
                <p className="truncate text-xs text-[var(--ink-muted)]">{mode.replaceAll("_", " ")}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </>
      ) : <EmptyState />}
    </Panel>
  );
}

const NUTRIENTS = [
  ["calories_kcal", "Calories", "kcal"],
  ["protein_g", "Protein", "g"],
  ["carbohydrate_g", "Carbohydrate", "g"],
  ["fat_g", "Fat", "g"],
] as const;

function MacroPanel({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <Panel
      id="macro-title"
      title="Macro distributions"
      subtitle="Distribution = meal-level nutrient values grouped into fixed, comparable buckets."
    >
      {metrics.macro_distributions.length ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
          {NUTRIENTS.map(([key, label, unit]) => {
            const data = metrics.macro_distributions
              .filter((row) => row.nutrient === key)
              .map((row) => ({
                ...row,
                bucket: row.bucket_max === null ? `${row.bucket_min}+` : `${row.bucket_min}-${row.bucket_max}`,
              }));
            return (
              <div key={key} className="min-w-0">
                <p className="mb-2 text-xs font-semibold">{label} <span className="font-normal text-[var(--ink-muted)]">({unit})</span></p>
                <ChartFrame height={150}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
                      <CartesianGrid className="chart-grid" vertical={false} />
                      <XAxis dataKey="bucket" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Meals" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>
            );
          })}
        </div>
      ) : <EmptyState />}
    </Panel>
  );
}

function TopFoodsPanel({ metrics }: { metrics: DashboardMetrics }) {
  const data = metrics.top_foods.slice(0, 10).reverse();
  return (
    <Panel
      id="top-foods-title"
      title="Top logged foods"
      subtitle="Rank = frequency of meal-item ingredient names logged by users."
    >
      {data.length ? (
        <ChartFrame height={330}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
              <CartesianGrid className="chart-grid" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="ingredient_name" width={108} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" name="Logs" fill={COLORS.green} radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : <EmptyState />}
    </Panel>
  );
}

function FunnelPanel({ metrics }: { metrics: DashboardMetrics }) {
  const data = metrics.onboarding_funnel.steps.map((step) => ({ ...step, name: `Step ${step.step}` }));
  return (
    <Panel
      id="funnel-title"
      title="Onboarding funnel"
      subtitle="Conversion = unique users reaching each onboarding step (0 through 3), measured against users who started."
    >
      {data.length && metrics.onboarding_funnel.total_users ? (
        <>
          <ChartFrame height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data} margin={{ top: 6, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid className="chart-grid" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={54} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="user_count" name="Users" fill={COLORS.green} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-4 flex items-end justify-between border-t border-[var(--line)] pt-4">
            <div><p className="text-xs text-[var(--ink-muted)]">Started</p><p className="font-mono text-lg font-semibold">{metrics.onboarding_funnel.total_users}</p></div>
            <div className="text-right"><p className="text-xs text-[var(--ink-muted)]">Completed</p><p className="font-mono text-lg font-semibold">{percent(metrics.onboarding_funnel.completion_share)}</p></div>
          </div>
        </>
      ) : <EmptyState />}
    </Panel>
  );
}

function AiHealthPanel({ metrics }: { metrics: DashboardMetrics }) {
  const data = mergeLatency(metrics.ai_latency);
  const models = [...new Set(metrics.ai_latency.map((row) => row.model))];
  const failures = failureTotals(metrics.ai_failure_rate);
  const palette = [COLORS.green, COLORS.blue];
  return (
    <Panel
      id="ai-health-title"
      title="AI latency and failures"
      subtitle="Latency = pipeline total_ms by model at p50 and p95. Failure = a budget event with a non-null error_category."
      className="lg:col-span-2"
    >
      {data.length || failures.length ? (
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
          {data.length ? (
            <ChartFrame height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                  <CartesianGrid className="chart-grid" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}s`} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={dayLabel} />
                  <Legend iconType="plainline" />
                  {models.flatMap((model, index) => [
                    <Line key={`${model}-p50`} type="monotone" dataKey={`${model}_p50`} name={`${model} p50`} stroke={palette[index % palette.length]} strokeWidth={2.25} dot={false} connectNulls />,
                    <Line key={`${model}-p95`} type="monotone" dataKey={`${model}_p95`} name={`${model} p95`} stroke={palette[index % palette.length]} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />,
                  ])}
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : <EmptyState />}
          <div>
            <p className="mb-3 text-xs font-semibold text-[var(--ink-muted)]">Failure rate in period</p>
            <div className="space-y-3">
              {failures.length ? failures.map((row) => (
                <div key={row.model} className="rounded-xl bg-[var(--surface-muted)] p-4">
                  <p className="truncate text-xs text-[var(--ink-muted)]">{row.model}</p>
                  <div className="mt-2 flex items-baseline justify-between gap-4">
                    <p className="font-mono text-2xl font-semibold tracking-[-0.04em]">{percent(row.rate)}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{row.failures} / {row.events} events</p>
                  </div>
                </div>
              )) : <EmptyState compact />}
            </div>
          </div>
        </div>
      ) : <EmptyState />}
    </Panel>
  );
}

function TokenCostPanel({ rows }: { rows: TokenCostRow[] }) {
  const data = mergeCosts(rows);
  const models = [...new Set(rows.map((row) => row.model))];
  const palette = [COLORS.green, COLORS.blue, COLORS.amber];
  const total = rows.reduce((sum, row) => sum + row.cost_usd, 0);
  return (
    <Panel
      id="token-cost-title"
      title="Token cost"
      subtitle="Cost = input and output tokens multiplied by the fixed per-model USD price table in the transform."
    >
      {data.length ? (
        <>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-xs text-[var(--ink-muted)]">Period total</p>
            <p className="font-mono text-lg font-semibold">${total.toFixed(4)}</p>
          </div>
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid className="chart-grid" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(3)}`} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={dayLabel} />
                <Legend iconType="square" />
                {models.map((model, index) => (
                  <Area key={model} type="monotone" dataKey={model} name={model} stackId="cost" stroke={palette[index % palette.length]} fill={palette[index % palette.length]} fillOpacity={0.62} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        </>
      ) : <EmptyState />}
    </Panel>
  );
}

function MatchRatePanel({ metrics }: { metrics: DashboardMetrics }) {
  const latest = metrics.match_rate.at(-1);
  return (
    <Panel
      id="match-rate-title"
      title="Ingredient match rate"
      subtitle="Match rate = matched ingredients / (matched + unmatched), aggregated by pipeline-run day."
    >
      {metrics.match_rate.length ? (
        <>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-xs text-[var(--ink-muted)]">Latest day</p>
            <p className="font-mono text-lg font-semibold">{latest ? percent(latest.match_rate) : "-"}</p>
          </div>
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.match_rate} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid className="chart-grid" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 1]} tickFormatter={(value) => `${Number(value) * 100}%`} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={dayLabel} />
                <Line type="monotone" dataKey="match_rate" name="Match rate" stroke={COLORS.green} strokeWidth={2.75} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </>
      ) : <EmptyState />}
    </Panel>
  );
}

const REASON_LABELS: Record<string, string> = {
  kcal_positive_all_macros_zero: "Calories present, all macros zero",
  carb_staple_zero_carbohydrate: "Carb staple with zero carbohydrate",
  macro_calorie_mismatch_over_40_percent: "Macro calories differ by over 40%",
};

function CoveragePanel({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <Panel
      id="coverage-title"
      title="Food coverage and integrity"
      subtitle="Coverage gaps rank unmatched query frequency. Implausible foods trigger one of the three locked nutrition rules: empty macros with calories, zero carbohydrate for a carb staple, or a 4/4/9 calorie mismatch above 40%."
      className="lg:col-span-2"
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.28fr)]">
        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--ink-muted)]">Most frequent unmatched foods</p>
          {metrics.coverage_gaps.length ? (
            <div className="overflow-hidden rounded-xl border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs text-[var(--ink-muted)]">
                  <tr><th className="px-3 py-2.5 text-left font-medium">Rank</th><th className="px-3 py-2.5 text-left font-medium">Query</th><th className="px-3 py-2.5 text-right font-medium">Count</th></tr>
                </thead>
                <tbody>
                  {metrics.coverage_gaps.slice(0, 10).map((row) => (
                    <tr key={`${row.rank}-${row.query_text}`} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--ink-muted)]">{row.rank}</td>
                      <td className="px-3 py-2.5 font-medium">{row.query_text}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState />}
        </div>
        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold text-[var(--ink-muted)]">Implausible nutrition rows</p>
          {metrics.implausible_foods.length ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Food</th>
                    <th className="px-3 py-2.5 text-right font-medium">kcal</th>
                    <th className="px-3 py-2.5 text-right font-medium">P / C / F</th>
                    <th className="px-3 py-2.5 text-right font-medium">Mismatch</th>
                    <th className="px-3 py-2.5 text-left font-medium">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.implausible_foods.slice(0, 10).map((row) => (
                    <tr key={String(row.id)} className="border-t border-[var(--line)] align-top">
                      <td className="px-3 py-2.5"><span className="block font-medium">{row.name_en || "Unnamed food"}</span><span className="text-xs text-[var(--ink-muted)]">{row.type_en || "Unclassified"}</span></td>
                      <td className="px-3 py-2.5 text-right font-mono">{row.calories_kcal}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{row.protein_g} / {row.carbohydrate_g} / {row.fat_g}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{percent(row.mismatch_share)}</td>
                      <td className="max-w-64 px-3 py-2.5 text-xs leading-5 text-[var(--ink-muted)]">{row.reasons.map((reason) => REASON_LABELS[reason] ?? reason).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState />}
        </div>
      </div>
    </Panel>
  );
}

export function Dashboard({
  metrics,
  errors,
  from,
  to,
  mockMode,
}: {
  metrics: DashboardMetrics;
  errors: string[];
  from: string;
  to: string;
  mockMode: boolean;
}) {
  const latestDau = metrics.dau_wau.at(-1);
  const meals = metrics.meal_volume.reduce((sum, row) => sum + row.count, 0);
  const latestMatch = metrics.match_rate.at(-1);

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
      <header className="mb-8 border-b border-[var(--line)] pb-7 sm:mb-10 sm:pb-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
              <span className="font-mono font-semibold uppercase tracking-[0.12em] text-[var(--accent-dark)]">Kallo Analytics</span>
              {mockMode ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 font-medium text-[var(--accent-dark)]">Mock data</span> : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Nutrition operations</h1>
            <p className="mt-2 max-w-[65ch] text-sm leading-6 text-[var(--ink-muted)]">
              Product engagement, food quality, and AI pipeline health for the Vietnamese market.
            </p>
            <p className="mt-2 font-mono text-[11px] text-[var(--ink-muted)]">UTC window {from} to {to}</p>
          </div>
          <PipelineControl />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div><p className="text-xs text-[var(--ink-muted)]">Latest DAU</p><p className="mt-1 font-mono text-xl font-semibold">{latestDau?.dau ?? "-"}</p></div>
          <div><p className="text-xs text-[var(--ink-muted)]">Latest WAU</p><p className="mt-1 font-mono text-xl font-semibold">{latestDau?.wau ?? "-"}</p></div>
          <div><p className="text-xs text-[var(--ink-muted)]">Meals in window</p><p className="mt-1 font-mono text-xl font-semibold">{meals ? compactNumber(meals) : "-"}</p></div>
          <div><p className="text-xs text-[var(--ink-muted)]">Latest match rate</p><p className="mt-1 font-mono text-xl font-semibold">{latestMatch ? percent(latestMatch.match_rate) : "-"}</p></div>
        </div>
      </header>

      {errors.length ? (
        <div className="mb-6 rounded-xl border border-[oklch(0.78_0.07_28)] bg-[oklch(0.95_0.025_28)] px-4 py-3 text-sm text-[oklch(0.42_0.11_28)]" role="status">
          Some metrics could not be loaded. Available panels remain usable. <span className="font-mono text-xs">{errors.join(" | ")}</span>
        </div>
      ) : null}

      <div className="mb-5"><WeeklyInsight /></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EngagementPanel metrics={metrics} />
        <MealVolumePanel rows={metrics.meal_volume} />
        <MacroPanel metrics={metrics} />
        <TopFoodsPanel metrics={metrics} />
        <FunnelPanel metrics={metrics} />
        <AiHealthPanel metrics={metrics} />
        <TokenCostPanel rows={metrics.token_cost_daily} />
        <MatchRatePanel metrics={metrics} />
        <CoveragePanel metrics={metrics} />
      </div>

      <footer className="mt-8 border-t border-[var(--line)] py-5 text-xs leading-5 text-[var(--ink-muted)]">
        Aggregate data only. User identity is pseudonymized upstream; ALB access is the dashboard authentication boundary.
      </footer>
    </main>
  );
}
