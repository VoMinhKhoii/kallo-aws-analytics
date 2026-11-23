'use client';
import { useState } from 'react';
import { int } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { MetricTabs } from '@/components/shared/metric-tabs';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';

interface Summary { counts: { open: number; open_over_48h: number; received: number; closed: number }; daily: { date: string; bug: number; ingredient: number; idea: number; closed: number }[] }
const TYPES = [{ key: 'bug', label: 'Bugs', color: 'var(--console-brick)' }, { key: 'ingredient', label: 'Ingredient requests', color: 'var(--console-data)' }, { key: 'idea', label: 'Ideas', color: 'var(--console-green)' }] as const;

/** The last 30 days of reports as tabs, with the open backlog beside them. Picking the backlog filters the list. */
export function FeedbackSummary({ version, onOpen }: { version: number; onOpen: () => void }) {
  const { data, error, loading, refresh } = useResource<Summary>(`/api/admin/records?kind=feedback&summary=1&v=${version}`);
  const [tab, setTab] = useState('received');
  if (loading && !data) return <MetricSection title="Feedback" loading />;
  if (error || !data) return <MetricSection title="Feedback" error={error ?? 'Feedback numbers are unavailable.'} retry={refresh} />;
  const sum = (key: 'bug' | 'ingredient' | 'idea' | 'closed') => data.daily.reduce((n, r) => n + r[key], 0);
  const series = tab === 'received' ? TYPES.map(t => ({ key: t.key, label: t.label, color: t.color }))
    : tab === 'closed' ? [{ key: 'closed', label: 'Closed', color: 'var(--console-green)' }]
    : TYPES.filter(t => t.key === tab).map(t => ({ key: t.key, label: t.label, color: 'var(--console-data)' }));
  const backlog = <section aria-label="Open backlog" className="grid content-start gap-6">
    <h2 className="text-base font-medium">Open now</h2>
    <button type="button" onClick={onOpen} className="grid gap-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]" title="Show open reports in the list">
      <span className="text-sm text-muted-foreground">Waiting for triage</span>
      <span className="tabular text-[38px] leading-[44px] font-medium tracking-[-1px]">{int(data.counts.open)}</span>
    </button>
    <div className="grid gap-1 border-t border-border pt-5">
      <span className="text-sm text-muted-foreground">Open over 48 h</span>
      <span className={`tabular text-[22px] leading-7 font-medium ${data.counts.open_over_48h ? 'text-[var(--console-amber)]' : ''}`}>{int(data.counts.open_over_48h)}</span>
    </div>
  </section>;
  return <MetricTabs value={tab} onChange={setTab} aside={backlog} tabs={[
    { key: 'received', label: 'Received, 30 d', value: int(data.counts.received) },
    { key: 'bug', label: 'Bugs', value: int(sum('bug')) },
    { key: 'ingredient', label: 'Ingredient requests', value: int(sum('ingredient')) },
    { key: 'idea', label: 'Ideas', value: int(sum('idea')) },
    { key: 'closed', label: 'Closed, 30 d', value: int(data.counts.closed), title: 'Resolved or won’t fix' },
  ]}>
    <LazySeriesChart bare compact height={260} integer title="Reports per day" rows={data.daily} series={series} />
  </MetricTabs>;
}
