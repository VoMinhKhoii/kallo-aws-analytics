"use client";
import { useEffect, useState } from 'react';
import { useRefocus } from '@/lib/use-refocus';
export interface Overview { summary: { accounts: number; signups: number; open_feedback: number; requests: number; errors: number; p95_ms: number | null }; trend: {date: string; requests: number; errors: number}[] }
export function useOverview(window: string) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [version, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1); useRefocus(refresh);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    fetch('/api/admin/overview?days=' + window.slice(0, -1), {cache: 'no-store'}).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'Overview unavailable'); return body; }).then(body => { if (active) setData(body); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [window, version]);
  // TODO(backend): add DAU/WAU by complete UTC day, prior complete-window KPI
  // values, failed meals today, feedback open >48h, grants ending within 3d.
  // Account totals and window errors must not stand in for these metrics.
  return {data, error, loading, refresh};
}
