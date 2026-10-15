"use client";
import { int, ms, pct } from '@/lib/ai-usage/format';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { useOverview } from './use-overview';
export function Overview({win, setWin}: {win: string; setWin: (v: string) => void}) {
  const {data, error, loading, refresh} = useOverview(win);
  if (loading && !data) return <PageSkeleton title="Overview" charts={1} rows />;
  const n = int;
  return <div className="mx-auto grid max-w-[1320px] gap-3 py-4"><PageHeader title="Overview" window={win} onWindow={setWin} refreshing={loading} onRefresh={refresh} />{error && <MetricSection title="Overview unavailable" error={error} retry={refresh} />}{data && <><KpiStrip items={[
    {label: 'Meals analysed', value: n(data.summary.requests)}, {label: 'Error rate', value: data.summary.requests ? pct(data.summary.errors / data.summary.requests) : '—'}, {label: 'p95 meal latency', value: ms(data.summary.p95_ms)}, {label: 'DAU', value: '—', sub: 'Not available'}, {label: 'New signups', value: n(data.summary.signups)}, {label: 'Open feedback', value: n(data.summary.open_feedback)},
  ]} />{!data.summary.requests && <p className="text-sm text-muted-foreground">No meals were analysed in this window.</p>}<LazySeriesChart bars title="Meals per day" rows={data.trend} series={[{key: 'requests', label: 'Analysed', color: 'var(--console-green)'}, {key: 'errors', label: 'Errors', color: 'var(--console-brick)'}]} /><MetricSection title="Active users"><p className="text-sm text-muted-foreground">Daily and weekly active users are not available in the overview response yet.</p></MetricSection></>}<MetricSection title="Needs attention">{[{href: '/traces?status=error&w=24h', label: 'Failed meals today'}, {href: '/feedback', label: 'Feedback open > 48 h'}, {href: '/premium', label: 'Grants ending within 3 days'}].map(i => <Link key={i.href} href={i.href} className="flex items-center justify-between gap-3 border-t border-border py-4 text-sm hover:bg-secondary"><span>{i.label}</span><span className="text-xs text-muted-foreground">Count unavailable →</span></Link>)}</MetricSection></div>;
}
