'use client';
import Link from 'next/link';
import { int, ms, pct } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { MetricSection } from '@/components/shared/metric-section';
import { date } from '@/components/admin/premium/shared';
import type { PipelineHealth as Health } from '@/lib/admin/health';

/** Meal pipeline health: always the last 24 h / 7 d, whatever the page window. Founder only. */
export const HEALTH_URL = '/api/admin/health';
export function usePipelineHealth(enabled: boolean) {
  return useResource<Health>(enabled ? HEALTH_URL : null);
}

/** The panel under the Meal success tab: success and latency, then the most common errors. */
export function PipelinePanel({ health }: { health: ReturnType<typeof usePipelineHealth> }) {
  const { data, error, loading, refresh } = health;
  if (loading && !data) return <MetricSection title="Meal pipeline" loading />;
  if (error || !data) return <MetricSection title="Meal pipeline" error={error ?? 'Pipeline health is unavailable.'} retry={refresh} />;
  const rate = (w: '24h' | '7d') => data.success.find(s => s.window === w);
  const facts = [
    ...(['24h', '7d'] as const).map(w => { const r = rate(w); return { label: `Success, ${w === '24h' ? '24 h' : '7 d'}`, value: pct(r?.rate), detail: r ? `${int(r.failed)} failed of ${int(r.succeeded + r.failed)}` : undefined }; }),
    { label: 'Meal p50, 24 h', value: ms(data.latency24h.p50), detail: `${int(data.latency24h.runs)} runs` },
    { label: 'Meal p95, 24 h', value: ms(data.latency24h.p95), detail: `p99 ${ms(data.latency24h.p99)}` },
  ];
  return <div className="grid gap-8">
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4">{facts.map(f => <div key={f.label} className="grid content-start gap-1"><dt className="text-sm text-muted-foreground">{f.label}</dt><dd className="tabular text-[22px] leading-7 font-medium">{f.value}</dd>{f.detail && <dd className="text-xs text-[var(--console-faint)]">{f.detail}</dd>}</div>)}</dl>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left text-sm text-muted-foreground">Most common errors, last 7 days. Requests are kept {data.retentionDays} days.</caption>
      <thead className="text-xs text-[var(--console-faint)]"><tr>{['Error', 'Count', 'Last seen', 'Latest message'].map(h => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
      <tbody>{data.topErrors.map(e => <tr key={e.code} className="border-t border-border align-top">
        <td className="py-3 pr-4"><Link prefetch={false} className="hover:underline" href={`/traces?status=error&w=7d`}>{e.code}</Link></td>
        <td className="tabular py-3 pr-4">{int(e.count)}</td>
        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{date(e.lastSeen)}</td>
        <td className="max-w-[640px] break-words py-3 text-muted-foreground">{e.sample ?? '—'}</td>
      </tr>)}</tbody></table>
      {!data.topErrors.length && <p className="py-2 text-sm text-muted-foreground">No errors in the last 7 days.</p>}</div>
  </div>;
}
