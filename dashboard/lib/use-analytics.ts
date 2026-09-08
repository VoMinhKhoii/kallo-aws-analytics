"use client";
import * as React from "react";

/**
 * Client cache in front of /api/analytics.
 *
 * Flipping the range back to one already viewed, or re-selecting a row whose
 * detail was already fetched, must not produce another request. Anything the
 * session has already seen is served from memory.
 */
const memo = new Map<string, unknown>();
const waiting = new Map<string, Promise<unknown>>();

export function analyticsUrl(fn: string, params: Record<string, string | number | undefined> = {}) {
  const u = new URLSearchParams({ fn });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  return `/api/analytics?${u.toString()}`;
}

async function load(url: string, bypass = false): Promise<unknown> {
  if (!bypass && memo.has(url)) return memo.get(url);
  const pending = waiting.get(url);
  if (pending) return pending;

  const p = fetch(url)
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(body?.error ?? `request failed (${r.status})`) as Error & { code?: string };
        e.code = body?.code;
        throw e;
      }
      memo.set(url, body.data);
      return body.data;
    })
    .finally(() => waiting.delete(url));

  waiting.set(url, p);
  return p;
}

export type Async<T> = { data: T | null; error: string | null; code?: string; loading: boolean; refreshing: boolean; refresh: () => void };

export function useAnalytics<T>(
  fn: string,
  params: Record<string, string | number | undefined> = {},
  enabled = true
): Async<T> {
  const url = analyticsUrl(fn, params);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [state, setState] = React.useState<Async<T>>(() => ({
    data: (memo.get(url) as T) ?? null,
    error: null,
    loading: enabled && !memo.has(url),
    refreshing: false,
    refresh: () => setRefreshKey((value) => value + 1),
  }));

  React.useEffect(() => {
    if (!enabled) return;
    const bypass = refreshKey > 0;
    if (!bypass && memo.has(url)) {
      setState((previous) => ({ ...previous, data: memo.get(url) as T, error: null, loading: false, refreshing: false }));
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: !s.data, refreshing: Boolean(s.data), error: null }));
    const requestUrl = bypass ? `${url}&refresh=1` : url;
    load(requestUrl, bypass)
      .then((d) => {
        memo.set(url, d);
        if (live) setState((previous) => ({ ...previous, data: d as T, error: null, loading: false, refreshing: false }));
      })
      .catch((e: Error & { code?: string }) => live && setState((previous) => ({ ...previous, error: e.message, code: e.code, loading: false, refreshing: false })));
    return () => { live = false; };
  }, [url, enabled, refreshKey]);

  return state;
}

/** Offset pager that keeps every page it has already pulled. */
export function usePaged<Row>(
  fn: string,
  params: Record<string, string | number | undefined>,
  pageSize: number,
  enabled = true
) {
  const [offset, setOffset] = React.useState(0);
  const [rows, setRows] = React.useState<Row[]>([]);
  const key = JSON.stringify(params);

  React.useEffect(() => { setOffset(0); setRows([]); }, [key, fn]);

  const res = useAnalytics<{ rows: Row[]; total: number } & Record<string, unknown>>(
    fn, { ...params, limit: pageSize, offset }, enabled
  );

  React.useEffect(() => {
    if (!res.data) return;
    setRows((prev) => (offset === 0 ? res.data!.rows : [...prev.slice(0, offset), ...res.data!.rows]));
  }, [res.data, offset]);

  const total = res.data?.total ?? 0;
  return {
    rows, total, meta: res.data, error: res.error, code: res.code, loading: res.loading, refreshing: res.refreshing, refresh: res.refresh,
    hasMore: rows.length < total,
    loadMore: () => setOffset(rows.length),
  };
}
