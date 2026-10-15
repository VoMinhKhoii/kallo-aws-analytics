"use client";
import { useMemo } from 'react';
import { rangeWindow, type ConsoleRange } from '@/components/console/console';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { useCloudMonitoring } from '@/lib/use-cloud-monitoring';
import { useSessionRole } from '@/lib/use-auth';
import { RunControl } from './run-control';
export function System({win, setWin}: {win: string; setWin: (v: string) => void}) {
  const window = useMemo(() => rangeWindow(win as ConsoleRange), [win]);
  const monitoring = useCloudMonitoring(window.from, window.to); const auth = useSessionRole();
  if (monitoring.loading) return <PageSkeleton title="System" cells={5} charts={5} />;
  const points = (monitoring.data?.series ?? []).map(p => ({...p, date: p.timestamp}));
  const latest = points.at(-1); const requests = points.reduce((n,p) => n + (p.request_count ?? 0), 0); const errors = points.reduce((n,p) => n + (p.error_count ?? 0), 0);
  const ms = (v?: number) => v == null ? '—' : `${(v / 1000).toFixed(2)} s`;
  const routeStore = monitoring.data?.route_source === 'cloud-logging-dynamodb';
  const latency = routeStore ? [{key: 'ai_p95_ms', label: 'Analyze-meal p95', color: 'var(--console-blue)'}, {key: 'ai_p99_ms', label: 'Analyze-meal p99', color: 'var(--console-brick)'}, {key: 'normal_p95_ms', label: 'Non-AI p95', color: 'var(--console-green)'}, {key: 'normal_p99_ms', label: 'Non-AI p99', color: 'var(--console-amber)'}] : [{key: 'p95_ms', label: 'p95', color: 'var(--console-blue)'}, {key: 'p99_ms', label: 'p99', color: 'var(--console-brick)'}];
  const average = points.filter(p => p.instances != null); const avg = average.length ? average.reduce((n,p) => n + p.instances!, 0) / average.length : null;
  return <div className="mx-auto grid max-w-[1320px] gap-3 py-4"><PageHeader title="System" window={win} onWindow={setWin} refreshing={monitoring.refreshing} onRefresh={monitoring.refresh} />{monitoring.error && <MetricSection title="Monitoring unavailable" error={monitoring.error} retry={monitoring.refresh} />}<KpiStrip items={[{label: 'Requests', value: monitoring.data ? String(requests) : '—'}, {label: '5xx rate', value: requests ? `${(100 * errors / requests).toFixed(1)}%` : '—'}, {label: 'p95 (HTTP)', value: ms(latest?.p95_ms), sub: 'Latest aligned interval'}, {label: 'p99', value: ms(latest?.p99_ms), sub: 'Latest aligned interval'}, {label: 'Avg instances', value: avg == null ? '—' : avg.toFixed(2)}]} /><LazySeriesChart title="HTTP latency" rows={points} series={latency} format="duration" /><LazySeriesChart title="Requests and 5xx" rows={points} series={[{key: 'request_count', label: 'Requests', color: 'var(--console-blue)'}, {key: 'error_count', label: '5xx', color: 'var(--console-brick)'}]} /><LazySeriesChart title="Container startup p95" rows={points} series={[{key: 'startup_p95_ms', label: 'Startup p95', color: 'var(--console-amber)'}]} format="duration" /><LazySeriesChart title="CPU / memory p95" rows={points} series={[{key: 'cpu_p95', label: 'CPU p95', color: 'var(--console-blue)'}, {key: 'memory_p95', label: 'Memory p95', color: 'var(--console-green)'}]} format="percent" /><LazySeriesChart title="Instances" rows={points} series={[{key: 'instances', label: 'Instances', color: 'var(--console-blue)'}]} />{monitoring.data?.delivery_source !== 'cloudflare-direct' && <MetricSection title="Snapshot">{auth.role === 'founder' ? <RunControl /> : <p className="text-sm text-muted-foreground">Founder only</p>}</MetricSection>}</div>;
}
