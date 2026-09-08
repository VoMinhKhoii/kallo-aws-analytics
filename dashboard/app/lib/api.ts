import "server-only";

import { getMockMetric } from "./mock-data";
import { unstable_cache } from "next/cache";
import {
  type DashboardMetrics,
  type MetricName,
  type MetricBundle,
  type MetricPayloadMap,
  type MetricResponse,
  type RunStatus,
} from "./types";

const MOCK_MODE = process.env.MOCK_API === "1";
const METRIC_REQUEST_SPACING_MS = 500;

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
    | ({ error?: string; code?: string; retry_after?: number; next_allowed_at?: string } & T)
    | null;
  if (!response.ok) {
    const error = new Error(body?.error || `Analytics API returned ${response.status}`) as Error & {
      status?: number;
      code?: string;
      retryAfter?: string;
      nextAllowedAt?: string;
    };
    error.status = response.status;
    error.code = body?.code;
    error.retryAfter = response.headers.get("Retry-After") ?? (body?.retry_after == null ? undefined : String(body.retry_after));
    error.nextAllowedAt = body?.next_allowed_at;
    throw error;
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

function latestPayload<T extends MetricName>(
  response: MetricResponse<MetricPayloadMap[T]>,
): MetricPayloadMap[T] | undefined {
  const latest = [...response.items].sort((left, right) =>
    left.date.localeCompare(right.date),
  ).at(-1);
  return latest?.payload;
}

/**
 * Fetch only the selected page metrics and retain the newest complete snapshot.
 * Aggregate payloads are full snapshots, so flattening rows from multiple
 * loader dates would double-count them. Missing metrics stay missing so the
 * console can show an honest empty state instead of a fabricated zero.
 */
export async function getSelectedMetrics(
  metrics: readonly MetricName[],
  from: string,
  to: string,
): Promise<MetricBundle> {
  const data: Partial<DashboardMetrics> = {};
  const errors: Partial<Record<MetricName, string>> = {};
  const selected = [...new Set(metrics)];

  for (const [index, metric] of selected.entries()) {
    if (!MOCK_MODE && index > 0) {
      await new Promise((resolve) => setTimeout(resolve, METRIC_REQUEST_SPACING_MS));
    }
    try {
      const response = await getMetric(metric, from, to);
      const payload = latestPayload(response);
      if (payload !== undefined) data[metric] = payload as never;
    } catch (reason) {
      errors[metric] = reason instanceof Error ? reason.message : "request failed";
    }
  }

  return { data, errors, from, to };
}

export const getCachedSelectedMetrics = unstable_cache(
  getSelectedMetrics,
  ["aws-dashboard-selected-metrics-operational-v4"],
  { revalidate: 300 },
);

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
