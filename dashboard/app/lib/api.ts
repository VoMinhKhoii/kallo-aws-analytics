import "server-only";

import { getMockMetric } from "./mock-data";
import {
  METRIC_NAMES,
  type CoverageGapRow,
  type DashboardMetrics,
  type FunnelPayload,
  type MacroRow,
  type MetricName,
  type MetricPayloadMap,
  type MetricResponse,
  type RetentionRow,
  type RunStatus,
  type TopFoodRow,
} from "./types";

const MOCK_MODE = process.env.MOCK_API === "1";

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1_000_000) / 1_000_000 : 0;
}

function apiConfiguration(): { baseUrl: string; token: string } {
  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.DASHBOARD_TOKEN ?? process.env.API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "API_BASE_URL and DASHBOARD_TOKEN must be configured when MOCK_API is not 1",
    );
  }
  return { baseUrl, token };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, token } = apiConfiguration();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | ({ error?: string } & T)
    | null;
  if (!response.ok) {
    throw new Error(body?.error || `Analytics API returned ${response.status}`);
  }
  if (body === null) throw new Error("Analytics API returned an invalid JSON response");
  return body;
}

export async function getMetric<T extends MetricName>(
  metric: T,
  from: string,
  to: string,
): Promise<MetricResponse<MetricPayloadMap[T]>> {
  if (MOCK_MODE) {
    return {
      metric,
      from,
      to,
      items: [{ metric, date: to, payload: getMockMetric(metric) }],
    };
  }
  return apiRequest<MetricResponse<MetricPayloadMap[T]>>(
    `/metrics/${metric}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function resolveMetric<T extends MetricName>(
  metric: T,
  response: MetricResponse<MetricPayloadMap[T]>,
): MetricPayloadMap[T] {
  const payloads = response.items.map((item) => item.payload);

  if (metric === "onboarding_funnel") {
    const funnels = payloads as FunnelPayload[];
    const totalUsers = funnels.reduce((sum, funnel) => sum + funnel.total_users, 0);
    const completedUsers = funnels.reduce(
      (sum, funnel) => sum + funnel.completed_users,
      0,
    );
    const usersByStep = new Map<number, number>();
    for (const funnel of funnels) {
      for (const step of funnel.steps) {
        usersByStep.set(step.step, (usersByStep.get(step.step) ?? 0) + step.user_count);
      }
    }
    return {
      total_users: totalUsers,
      completed_users: completedUsers,
      completion_share: ratio(completedUsers, totalUsers),
      steps: [...usersByStep.entries()]
        .sort(([left], [right]) => left - right)
        .map(([step, userCount]) => ({
          step,
          user_count: userCount,
          share_of_started: ratio(userCount, totalUsers),
        })),
    } as MetricPayloadMap[T];
  }

  if (metric === "macro_distributions") {
    const rows = (payloads as MacroRow[][]).flat();
    const byBucket = new Map<string, MacroRow>();
    for (const row of rows) {
      const key = `${row.nutrient}:${row.bucket_min}:${row.bucket_max ?? "plus"}`;
      const current = byBucket.get(key);
      byBucket.set(key, current ? { ...current, count: current.count + row.count } : { ...row });
    }
    const nutrientOrder = ["calories_kcal", "protein_g", "carbohydrate_g", "fat_g"];
    return [...byBucket.values()].sort(
      (left, right) =>
        nutrientOrder.indexOf(left.nutrient) - nutrientOrder.indexOf(right.nutrient) ||
        left.bucket_min - right.bucket_min,
    ) as MetricPayloadMap[T];
  }

  if (metric === "retention_cohorts") {
    const rows = (payloads as RetentionRow[][]).flat();
    const byCohortWeek = new Map<string, RetentionRow>();
    for (const row of rows) {
      const key = `${row.cohort_week}:${row.weeks_later}`;
      const current = byCohortWeek.get(key);
      const cohortSize = (current?.cohort_size ?? 0) + row.cohort_size;
      const activeUsers = (current?.active_users ?? 0) + row.active_users;
      byCohortWeek.set(key, {
        cohort_week: row.cohort_week,
        weeks_later: row.weeks_later,
        cohort_size: cohortSize,
        active_users: activeUsers,
        retention_rate: ratio(activeUsers, cohortSize),
      });
    }
    return [...byCohortWeek.values()].sort(
      (left, right) =>
        left.cohort_week.localeCompare(right.cohort_week) ||
        left.weeks_later - right.weeks_later,
    ) as MetricPayloadMap[T];
  }

  if (metric === "top_foods") {
    const counts = new Map<string, number>();
    for (const row of (payloads as TopFoodRow[][]).flat()) {
      counts.set(row.ingredient_name, (counts.get(row.ingredient_name) ?? 0) + row.count);
    }
    return [...counts.entries()]
      .sort(([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount || leftName.localeCompare(rightName),
      )
      .slice(0, 20)
      .map(([ingredientName, count], index) => ({
        rank: index + 1,
        ingredient_name: ingredientName,
        count,
      })) as MetricPayloadMap[T];
  }

  if (metric === "coverage_gaps") {
    const counts = new Map<string, number>();
    for (const row of (payloads as CoverageGapRow[][]).flat()) {
      counts.set(row.query_text, (counts.get(row.query_text) ?? 0) + row.count);
    }
    return [...counts.entries()]
      .sort(([leftQuery, leftCount], [rightQuery, rightCount]) =>
        rightCount - leftCount || leftQuery.localeCompare(rightQuery),
      )
      .slice(0, 30)
      .map(([queryText, count], index) => ({
        rank: index + 1,
        query_text: queryText,
        count,
      })) as MetricPayloadMap[T];
  }

  if (metric === "implausible_foods") {
    return (payloads.at(-1) ?? []) as MetricPayloadMap[T];
  }

  return payloads.flatMap((payload) => (Array.isArray(payload) ? payload : [])) as MetricPayloadMap[T];
}

export async function getDashboardMetrics(from: string, to: string): Promise<{
  data: DashboardMetrics;
  errors: string[];
}> {
  const results = await Promise.allSettled(
    METRIC_NAMES.map(async (metric) => ({
      metric,
      response: await getMetric(metric, from, to),
    })),
  );
  const data = {} as DashboardMetrics;
  const errors: string[] = [];

  results.forEach((result, index) => {
    const metric = METRIC_NAMES[index];
    if (result.status === "fulfilled") {
      data[metric] = resolveMetric(metric, result.value.response) as never;
      return;
    }
    errors.push(`${metric}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
    data[metric] = (metric === "onboarding_funnel"
      ? { total_users: 0, completed_users: 0, completion_share: 0, steps: [] }
      : []) as never;
  });
  return { data, errors };
}

export async function getWeeklyInsight(): Promise<{ summary: string }> {
  if (MOCK_MODE) {
    return {
      summary:
        "Meal logging grew through the workweek while match quality improved to 93%. Gemini 2.5 Flash remained the main route, with combined estimated token cost averaging about $1.40 per day. P95 latency is still the main watch item, especially on Pro calls. Coverage review should prioritize bún riêu cua and bánh canh cua, the two most frequent unmatched foods in this sample.",
    };
  }
  return apiRequest<{ summary: string }>("/insight/weekly", { method: "POST" });
}

export async function startRun(): Promise<{ run_id: string }> {
  if (MOCK_MODE) {
    const run_id = `mock-${Date.now()}`;
    return { run_id };
  }
  return apiRequest<{ run_id: string }>("/runs", { method: "POST" });
}

export async function getRun(runId: string): Promise<RunStatus> {
  if (MOCK_MODE) {
    const started = Number(runId.replace(/^mock-/, ""));
    if (!Number.isFinite(started)) throw new Error("Mock run id is invalid");
    const elapsed = Date.now() - started;
    const phase = elapsed < 5_000 ? "extracting" : elapsed < 10_000 ? "transform_started" : "completed";
    return { run_id: runId, phase, updated_at: new Date().toISOString() };
  }
  return apiRequest<RunStatus>(`/runs/${encodeURIComponent(runId)}`);
}
