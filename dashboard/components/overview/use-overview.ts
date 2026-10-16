"use client";
import { apiFetch } from '@/lib/api-fetch';
import { useEffect, useState } from 'react';
import type { Overview } from '@/lib/admin/overview';
import { useRefocus } from '@/lib/use-refocus';
export function useOverview(window: string) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [version, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1); useRefocus(refresh);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    apiFetch('/api/admin/overview?w=' + window + (version ? '&refresh=1' : ''), {cache: 'no-store'}).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'Overview unavailable'); return body; }).then(body => { if (active) setData(body); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [window, version]);
  return {data, error, loading, refresh};
}
