"use client";

import * as React from "react";
import type { DashboardMetrics, MetricBundle, MetricName } from "@/app/lib/types";

const memo = new Map<string, MetricBundle>();
const waiting = new Map<string, Promise<MetricBundle>>();

export function metricBundleUrl(
  metrics: readonly MetricName[],
  from: string,
  to: string,
): string {
  const params = new URLSearchParams({
    metrics: [...new Set(metrics)].join(","),
    from,
    to,
  });
  return `/api/metrics?${params.toString()}`;
}

async function load(url: string): Promise<MetricBundle> {
  const hit = memo.get(url);
  if (hit) return hit;
  const pending = waiting.get(url);
  if (pending) return pending;

  const promise = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as
        | (MetricBundle & { error?: string; code?: string })
        | null;
      if (!response.ok) {
        const error = new Error(body?.error ?? `metric request failed (${response.status})`) as Error & {
          code?: string;
        };
        error.code = body?.code;
        throw error;
      }
      if (!body || typeof body.data !== "object" || typeof body.errors !== "object") {
        throw new Error("The metrics endpoint returned an invalid response");
      }
      memo.set(url, body);
      return body;
    })
    .finally(() => waiting.delete(url));

  waiting.set(url, promise);
  return promise;
}

export type MetricBundleState = {
  data: Partial<DashboardMetrics> | null;
  errors: Partial<Record<MetricName, string>>;
  loading: boolean;
  error: string | null;
};

export function useMetricBundle(
  metrics: readonly MetricName[],
  from: string,
  to: string,
  enabled = true,
): MetricBundleState {
  const url = metricBundleUrl(metrics, from, to);
  const [state, setState] = React.useState<MetricBundleState>(() => {
    const cached = memo.get(url);
    return {
      data: cached?.data ?? null,
      errors: cached?.errors ?? {},
      loading: enabled && !cached,
      error: null,
    };
  });

  React.useEffect(() => {
    if (!enabled) {
      setState({ data: null, errors: {}, loading: false, error: null });
      return;
    }
    const cached = memo.get(url);
    if (cached) {
      setState({ data: cached.data, errors: cached.errors, loading: false, error: null });
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    load(url)
      .then((bundle) => {
        if (active) setState({ data: bundle.data, errors: bundle.errors, loading: false, error: null });
      })
      .catch((reason: Error & { code?: string }) => {
        if (active) setState({ data: null, errors: {}, loading: false, error: reason.message });
      });
    return () => {
      active = false;
    };
  }, [enabled, url]);

  return state;
}
