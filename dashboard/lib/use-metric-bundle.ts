"use client";
import { apiFetch, revalidateIfStale } from '@/lib/api-fetch';

import { useRefocus } from "@/lib/use-refocus";
import * as React from "react";
import type { DashboardMetrics, MetricBundle, MetricName } from "@/app/lib/types";

const memo = new Map<string, MetricBundle>();
const waiting = new Map<string, Promise<MetricBundle>>();
const freshListeners = new Map<string, Set<(bundle: MetricBundle) => void>>();

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

async function load(url: string, bypass = false): Promise<MetricBundle> {
  const hit = bypass ? undefined : memo.get(url);
  if (hit) return hit;
  const pending = waiting.get(url);
  if (pending) return pending;

  const promise = apiFetch(url, { cache: "no-store" })
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
      revalidateIfStale(response, url, async (fresh) => {
        const next = await fresh.json().catch(() => null) as MetricBundle | null;
        if (!next || typeof next.data !== "object" || typeof next.errors !== "object") return;
        memo.set(url, next);
        freshListeners.get(url)?.forEach((fn) => fn(next));
      });
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
  refresh: () => void;
  refreshing: boolean;
};

export function useMetricBundle(
  metrics: readonly MetricName[],
  from: string,
  to: string,
  enabled = true,
): MetricBundleState {
  const url = metricBundleUrl(metrics, from, to);
  const [refreshKey, setRefreshKey] = React.useState(0);
  useRefocus(() => setRefreshKey(v => v + 1));
  const [state, setState] = React.useState<MetricBundleState>(() => {
    const cached = memo.get(url);
    return {
      data: cached?.data ?? null,
      errors: cached?.errors ?? {},
      loading: enabled && !cached,
      error: null,
      refresh: () => setRefreshKey((value) => value + 1),
      refreshing: false,
    };
  });

  React.useEffect(() => {
    if (!enabled) {
      setState((previous) => ({ ...previous, data: null, errors: {}, loading: false, error: null, refreshing: false }));
      return;
    }
    const bypass = refreshKey > 0;
    const cached = bypass ? undefined : memo.get(url);
    if (cached) {
      setState((previous) => ({ ...previous, data: cached.data, errors: cached.errors, loading: false, error: null, refreshing: false }));
      return;
    }
    let active = true;
    const onFresh = (bundle: MetricBundle) => { if (active) setState((previous) => ({ ...previous, data: bundle.data, errors: bundle.errors })); };
    if (!freshListeners.has(url)) freshListeners.set(url, new Set());
    freshListeners.get(url)!.add(onFresh);
    setState((previous) => ({ ...previous, loading: !previous.data, refreshing: Boolean(previous.data), error: null }));
    const requestUrl = bypass ? `${url}&refresh=1` : url;
    load(requestUrl, bypass)
      .then((bundle) => {
        memo.set(url, bundle);
        if (active) setState((previous) => ({ ...previous, data: bundle.data, errors: bundle.errors, loading: false, refreshing: false, error: null }));
      })
      .catch((reason: Error & { code?: string }) => {
        if (active) setState((previous) => ({ ...previous, loading: false, refreshing: false, error: reason.message }));
      });
    return () => {
      active = false;
      freshListeners.get(url)?.delete(onFresh);
    };
  }, [enabled, refreshKey, url]);

  return state;
}
