import type { AiMealsDailyRow, AiMealsRow, AiModelUsageRow, AiUsageDailyRow } from "@/app/lib/types";
import { describeModels, type ModelMeta, modelKey } from "./models";

export type WindowDays = 7 | 30 | 90;

/** UTC day strings for the last `days` days ending on `to` (inclusive). */
export function dayRange(to: string, days: number): string[] {
  const end = Date.parse(`${to}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export interface ModelSummary {
  meta: ModelMeta;
  calls: number;
  spend: number | null;
  share: number;
  /** $ per 1,000 priced calls. */
  perKCalls: number | null;
  p95: number | null;
  p99: number | null;
  errors: number;
  errorRate: number;
  fallbacks: number;
  cacheRate: number | null;
  unpricedCalls: number;
}

export interface Kpi {
  value: number | null;
  prev: number | null;
  spark: number[];
}

export interface Summary {
  models: ModelSummary[];
  spend: Kpi;
  calls: Kpi;
  perKMeals: Kpi;
  cacheRate: Kpi;
  mealP95: number | null;
  today: { spend: number; meals: number };
  callsPerMeal: number | null;
  shadowSpend: number;
  unpricedCalls: number;
  /** First day with per-call latency in the loaded range, if any. */
  timedSince: string | null;
}

export interface UsageInput {
  /** Daily rows covering the current window and the one before it. */
  daily: AiUsageDailyRow[];
  mealsDaily: AiMealsDailyRow[];
  /** Whole-window rows: percentiles over raw attempts, not daily averages. */
  window: AiModelUsageRow[];
  mealWindow: AiMealsRow | undefined;
  to: string;
  win: WindowDays;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function group<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.date, [...(out.get(r.date) ?? []), r]);
  return out;
}

/** Every model seen in the loaded range, shadow-only models labelled. */
export function modelsOf(input: Pick<UsageInput, "daily" | "window">): ModelMeta[] {
  const rows = [...input.window, ...input.daily];
  const all = new Map<string, boolean>();
  for (const r of rows) all.set(r.model, (all.get(r.model) ?? true) && r.shadow);
  return describeModels(all.keys(), new Set([...all].filter(([, s]) => s).map(([id]) => id)));
}

export function summarize(input: UsageInput, models: ModelMeta[]): Summary {
  const { win, to } = input;
  const cur = dayRange(to, win);
  const prev = dayRange(dayRange(to, win)[0], win + 1).slice(0, win);
  const byDay = group(input.daily);
  const mealsByDay = new Map(input.mealsDaily.map((r) => [r.date, r]));
  const metaById = new Map(models.map((m) => [m.id, m]));

  const daySpend = (d: string) => sum((byDay.get(d) ?? []).map((r) => r.spend_usd ?? 0));
  const dayCalls = (d: string) => sum((byDay.get(d) ?? []).map((r) => r.calls));
  const dayCache = (d: string) => {
    const rows = byDay.get(d) ?? [];
    const input = sum(rows.map((r) => r.input_tokens));
    return input ? sum(rows.map((r) => r.cached_tokens)) / input : 0;
  };
  const dayPerK = (d: string) => {
    const m = mealsByDay.get(d);
    return m?.priced_meals && m.spend_usd != null ? (m.spend_usd / m.priced_meals) * 1000 : 0;
  };
  const total = (days: string[], f: (d: string) => number) => sum(days.map(f));
  // Compare only against a prior window the data mostly covers; a half-empty
  // one (history starting mid-window, an outage) would fake a huge change.
  const hasPrev = prev.filter((d) => byDay.has(d)).length >= Math.ceil(win * 0.8);
  const mealsIn = (days: string[]) => days.map((d) => mealsByDay.get(d)).filter((m): m is AiMealsDailyRow => m != null);
  const perKOf = (rows: AiMealsDailyRow[]) => {
    const priced = sum(rows.map((r) => r.priced_meals));
    return priced ? (sum(rows.map((r) => r.spend_usd ?? 0)) / priced) * 1000 : null;
  };
  const cacheOf = (days: string[]) => {
    const rows = days.flatMap((d) => byDay.get(d) ?? []);
    const inputTokens = sum(rows.map((r) => r.input_tokens));
    return inputTokens ? sum(rows.map((r) => r.cached_tokens)) / inputTokens : null;
  };

  const windowSpend = sum(input.window.map((r) => r.spend_usd ?? 0));
  const summaries: ModelSummary[] = input.window
    .filter((r) => metaById.has(r.model))
    .map((r) => ({
      meta: metaById.get(r.model) as ModelMeta,
      calls: r.calls,
      spend: r.spend_usd,
      share: windowSpend ? (r.spend_usd ?? 0) / windowSpend : 0,
      perKCalls: r.spend_usd != null && r.calls - r.unpriced_calls > 0 ? (r.spend_usd / (r.calls - r.unpriced_calls)) * 1000 : null,
      p95: r.p95_ms,
      p99: r.p99_ms,
      errors: r.errors,
      errorRate: r.calls ? r.errors / r.calls : 0,
      fallbacks: r.fallbacks,
      cacheRate: r.input_tokens ? r.cached_tokens / r.input_tokens : null,
      unpricedCalls: r.unpriced_calls,
    }))
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));

  const meals = input.mealWindow;
  const todayRows = mealsByDay.get(to);
  const windowCalls = sum(input.window.map((r) => r.calls));
  const timed = input.daily.filter((r) => r.timed_calls > 0).map((r) => r.date).sort();

  return {
    models: summaries,
    spend: { value: windowSpend, prev: hasPrev ? total(prev, daySpend) : null, spark: cur.map(daySpend) },
    calls: { value: windowCalls, prev: hasPrev ? total(prev, dayCalls) : null, spark: cur.map(dayCalls) },
    perKMeals: {
      value: meals?.priced_meals && meals.spend_usd != null ? (meals.spend_usd / meals.priced_meals) * 1000 : null,
      prev: hasPrev ? perKOf(mealsIn(prev)) : null,
      spark: cur.map(dayPerK),
    },
    cacheRate: { value: cacheOf(cur), prev: hasPrev ? cacheOf(prev) : null, spark: cur.map(dayCache) },
    mealP95: meals?.p95_meal_usd ?? null,
    today: { spend: daySpend(to), meals: todayRows?.meals ?? 0 },
    callsPerMeal: meals?.meals ? windowCalls / meals.meals : null,
    shadowSpend: sum(input.window.filter((r) => r.shadow).map((r) => r.spend_usd ?? 0)),
    unpricedCalls: sum(input.window.map((r) => r.unpriced_calls)),
    timedSince: timed[0] ?? null,
  };
}

export type VolumeMetric = "spend" | "calls" | "tokens";
export type VolumeRow = { date: string; partial: boolean; total: number } & Record<string, number | string | boolean>;

/** One row per day of the window (gaps filled), one numeric column per model key. */
export function volumeRows(input: UsageInput, metric: VolumeMetric): VolumeRow[] {
  const byDay = group(input.daily);
  return dayRange(input.to, input.win).map((date) => {
    const row: VolumeRow = { date, partial: date === input.to, total: 0 };
    for (const r of byDay.get(date) ?? []) {
      const v = metric === "spend" ? r.spend_usd ?? 0 : metric === "calls" ? r.calls : r.input_tokens + r.output_tokens + r.thought_tokens;
      row[modelKey(r.model)] = v;
      row.total += v;
    }
    return row;
  });
}

export type TrendMetric = "p95" | "p99" | "errorRate" | "fallbackRate" | "cacheRate";
export type TrendRow = { date: string } & Record<string, number | string | null>;

function trendValue(r: AiUsageDailyRow, metric: TrendMetric): number | null {
  switch (metric) {
    case "p95": return r.timed_calls ? r.p95_ms : null;
    case "p99": return r.timed_calls ? r.p99_ms : null;
    case "errorRate": return r.calls ? r.errors / r.calls : null;
    case "fallbackRate": return r.calls && r.timed_calls ? r.fallbacks / r.calls : null;
    case "cacheRate": return r.input_tokens ? r.cached_tokens / r.input_tokens : null;
  }
}

/** Daily per-model series, starting at the first day any model recorded the metric. */
export function trendRows(input: UsageInput, metric: TrendMetric): TrendRow[] {
  const byDay = group(input.daily);
  const rows = dayRange(input.to, input.win).map((date) => {
    const row: TrendRow = { date };
    for (const r of byDay.get(date) ?? []) row[modelKey(r.model)] = trendValue(r, metric);
    return row;
  });
  const first = rows.findIndex((r) => Object.keys(r).some((k) => k !== "date" && r[k] != null));
  return first <= 0 ? rows : rows.slice(first);
}
