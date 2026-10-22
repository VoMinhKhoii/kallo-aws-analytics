'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { TraceList, TraceSummary } from '@/lib/traces/types';
import { MetricSection } from '@/components/shared/metric-section';
import { TraceRow } from '@/components/traces/list/trace-row';

/** The newest meal analyses as people typed them, each opening its trace. */
export function LatestMeals({ version }: { version: number }) {
  const [rows, setRows] = useState<TraceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setError(null);
    apiFetch(`/api/traces?w=7d&limit=5${version || retry ? '&refresh=1' : ''}`, { cache: 'no-store' })
      .then(async r => { const body = await r.json(); if (r.status === 403) throw new Error('Meal traces need founder access.'); if (!r.ok) throw new Error(body.error ?? 'Meal traces could not be loaded.'); return body as TraceList; })
      .then(body => { if (active) setRows(body.rows); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Meal traces could not be loaded.'); });
    return () => { active = false; };
  }, [version, retry]);
  return <MetricSection card title="Latest meals" description="Newest analyses in the last 7 days, as the user typed them." action={<Link href="/traces?w=7d" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">All traces →</Link>} error={error} retry={() => setRetry(n => n + 1)} empty={rows?.length === 0}>
    {rows == null
      ? <div role="status" aria-label="Loading latest meals">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 animate-pulse border-b border-border" />)}</div>
      : <div className="-mx-4">{rows.map(r => <TraceRow key={r.id} row={r} active={false} win="7d" />)}</div>}
  </MetricSection>;
}
