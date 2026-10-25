'use client';
import Link from 'next/link';
import { int, ms, pct } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { MetricSection } from '@/components/shared/metric-section';
import { date } from '@/components/admin/premium/shared';
import type { PipelineHealth as Health } from '@/lib/admin/health';

/** Success rates, meal latency percentiles and the most common errors: always the last 24 h / 7 d, whatever the page window. */
export function PipelineHealth() {
  const { data, error, loading, refresh } = useResource<Health>('/api/admin/health');
  const rate = (w: '24h' | '7d') => data?.success.find(s => s.window === w);
  const items = data ? [
    ...(['24h', '7d'] as const).map(w => { const r = rate(w); return { label: `Success ${w === '24h' ? '24 h' : '7 d'}`, value: pct(r?.rate), sub: r ? `${int(r.failed)} failed of ${int(r.succeeded + r.failed)}` : undefined }; }),
    { label: 'Success 30 d', value: '—', sub: `Requests are kept ${data.retentionDays} days` },
    { label: 'Meal p50 · 24 h', value: ms(data.latency24h.p50), sub: `${int(data.latency24h.runs)} runs` },
    { label: 'Meal p95 · 24 h', value: ms(data.latency24h.p95) },
    { label: 'Meal p99 · 24 h', value: ms(data.latency24h.p99) },
  ] : [];
  return <MetricSection title="Meal pipeline" description="Rejected non-meal input is not counted as a failure; replays are left out." loading={loading && !data} error={error} retry={refresh}>
    {data && <div className="grid gap-4">
      <KpiStrip items={items} />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-muted-foreground">Most common errors, last 7 days</caption>
        <thead className="text-xs text-muted-foreground"><tr>{['Error', 'Count', 'Last seen', 'Latest message'].map(h => <th key={h} className="px-2 py-2 font-normal">{h}</th>)}</tr></thead>
        <tbody>{data.topErrors.map(e => <tr key={e.code} className="border-t border-border align-top">
          <td className="px-2 py-2"><Link className="font-mono text-xs hover:underline" href={`/traces?status=error&w=7d`}>{e.code}</Link></td>
          <td className="tabular px-2 py-2">{int(e.count)}</td>
          <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{date(e.lastSeen)}</td>
          <td className="max-w-[520px] break-words px-2 py-2 text-xs">{e.sample ?? '—'}</td>
        </tr>)}</tbody></table>
        {!data.topErrors.length && <p className="py-2 text-sm text-muted-foreground">No errors in the last 7 days.</p>}</div>
    </div>}
  </MetricSection>;
}
