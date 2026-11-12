'use client';
import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react/ssr';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { fetchPrefetched } from '@/lib/prefetch';
import { int, ms, usd } from '@/lib/ai-usage/format';
import { modelLabel } from '@/lib/traces-ui/graph';
import type { TraceList, TraceSummary } from '@/lib/traces/types';
import { MetricSection } from '@/components/shared/metric-section';
import { StatusDot } from '@/components/traces/status-dot';

const COLS = 'grid grid-cols-[minmax(0,1fr)_64px_72px] items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,200px)_64px_72px_64px_88px]';

function ago(iso: string) {
  const min = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${Math.floor(min)} min ago` : `${Math.floor(min / 60)} h ago`;
}

export const LATEST_MEALS_URL = '/api/traces?w=7d&limit=8';

/** The newest meal analyses as people typed them, each opening its trace. */
export function LatestMeals({ version }: { version: number }) {
  const [rows, setRows] = useState<TraceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setError(null);
    (version || retry ? apiFetch(`${LATEST_MEALS_URL}&refresh=1`, { cache: 'no-store' }) : fetchPrefetched(LATEST_MEALS_URL, { cache: 'no-store' }))
      .then(async r => { const body = await r.json(); if (r.status === 403) throw new Error('Meal traces need founder access.'); if (!r.ok) throw new Error(body.error ?? 'Meal traces could not be loaded.'); return body as TraceList; })
      .then(body => { if (active) setRows(body.rows); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Meal traces could not be loaded.'); });
    return () => { active = false; };
  }, [version, retry]);
  return <MetricSection title="Latest meals" action={<Link prefetch={false} href="/traces?w=7d" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All traces<CaretRight aria-hidden="true" className="size-3" /></Link>} error={error} retry={() => setRetry(n => n + 1)} empty={rows?.length === 0}>
    {rows == null
      ? <div role="status" aria-label="Loading latest meals">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 animate-pulse border-b border-border" />)}</div>
      : <div role="table" aria-label="Latest meals" className="text-sm">
        <div role="row" className={`${COLS} h-8 border-b border-border text-xs text-[var(--console-faint)]`}>
          <span role="columnheader">Meal</span>
          <span role="columnheader" className="hidden md:block">Model</span>
          <span role="columnheader" className="text-right">Latency</span>
          <span role="columnheader" className="text-right">kcal</span>
          <span role="columnheader" className="hidden text-right md:block">Cost</span>
          <span role="columnheader" className="hidden text-right md:block">When</span>
        </div>
        {rows.map(r => {
          const model = [r.modelCall1, r.modelCall2].filter((x, i, a) => x && a.indexOf(x) === i).map(m => modelLabel(m!)).join(' → ') || r.models.map(modelLabel).join(', ') || '—';
          return <Link prefetch={false} key={r.id} role="row" href={`/traces/${r.id}?w=7d`} className={`${COLS} h-10 border-b border-border transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-accent)]`}>
            <span role="cell" className="flex min-w-0 items-center gap-2"><StatusDot status={r.status} /><span title={r.rawInput} className="truncate">{r.rawInput || r.mealName || 'Untitled meal'}</span>{(r.errorCode || r.error) && <span className="shrink-0 text-xs text-[var(--console-brick)]">{r.errorCode ?? r.error}</span>}</span>
            <span role="cell" title={model} className="hidden truncate text-muted-foreground md:block">{model}</span>
            <span role="cell" className="tabular text-right">{ms(r.durationMs)}</span>
            <span role="cell" className="tabular text-right">{r.status === 'error' || r.kcalMid == null ? '—' : int(r.kcalMid)}</span>
            <span role="cell" className="tabular hidden text-right text-muted-foreground md:block">{usd(r.costUsd)}</span>
            <span role="cell" className="hidden text-right text-muted-foreground md:block">{ago(r.createdAt)}</span>
          </Link>;
        })}
      </div>}
  </MetricSection>;
}
