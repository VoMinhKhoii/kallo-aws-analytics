"use client";
import { floorHour, hourRange } from '@/lib/windows';
import { weightedPercentile } from '@/lib/ai-usage/chart-data';
import { compact, decimal, int, ms, pct, shortDate } from '@/lib/ai-usage/format';
import { useRefocus } from '@/lib/use-refocus';
import { useMemo, useState } from 'react';
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
  const [asOf, setAsOf] = useState(() => new Date());
  const window = useMemo(() => rangeWindow(win as ConsoleRange, asOf), [win, asOf]);
  const monitoring = useCloudMonitoring(window.from, window.to);
  const chartMonitoring = useCloudMonitoring(win === '24h' ? floorHour(window.from) : window.from, window.to, win === '24h');
  const auth = useSessionRole();
  const refresh = () => { setAsOf(new Date()); monitoring.refresh(); chartMonitoring.refresh(); };
  useRefocus(refresh);
  if (monitoring.loading || win === '24h' && chartMonitoring.loading) return <PageSkeleton title="System" cells={5} charts={5} />;
  const points = (monitoring.data?.series ?? []).map(p => ({...p, date: p.timestamp}));
  // Monitoring timestamps mark interval ends; display each interval at its UTC hour origin.
  const chartSeries = (win === '24h' ? chartMonitoring.data?.series ?? [] : monitoring.data?.series ?? []);
  const hourlyPoints = new Map(chartSeries.map(p => [floorHour(new Date(Date.parse(p.timestamp) - 1).toISOString()), p]));
  const chartPoints = win === '24h' ? hourRange(window.to).map(date => ({...hourlyPoints.get(date), date})) : points;
  const requests = points.reduce((n,p) => n + (p.request_count ?? 0), 0); const errors = points.reduce((n,p) => n + (p.error_count ?? 0), 0);
  const routeStore = monitoring.data?.route_source === 'cloud-logging-dynamodb';
  const latency = routeStore ? [{key: 'ai_p95_ms', label: 'Analyze-meal p95', color: 'var(--console-data)'}, {key: 'ai_p99_ms', label: 'Analyze-meal p99', color: 'var(--console-muted)'}, {key: 'normal_p95_ms', label: 'Non-AI p95', color: 'var(--console-blue)'}, {key: 'normal_p99_ms', label: 'Non-AI p99', color: 'var(--console-quiet)'}] : [{key: 'p95_ms', label: 'p95', color: 'var(--console-data)'}, {key: 'p99_ms', label: 'p99', color: 'var(--console-muted)'}];
  const average = points.filter(p => p.instances != null); const avg = average.length ? average.reduce((n,p) => n + p.instances!, 0) / average.length : null;
  // The line under the title: volume and failures, then the worst latency moment and when it happened.
  const peak = points.reduce<{at: string; ms: number} | null>((best, p) => { const v = (p as Record<string, unknown>).p99_ms; return typeof v === 'number' && (!best || v > best.ms) ? {at: p.date, ms: v} : best; }, null);
  const finding = monitoring.data && requests ? `${int(requests)} requests ${win === '24h' ? 'in the last 24 hours' : `in the last ${win.replace('d', '')} days`}, ${int(errors)} returned 5xx.${peak ? ` p99 peaked at ${ms(peak.ms)} on ${shortDate(peak.at)} UTC.` : ''}` : undefined;
  return <div className="mx-auto grid max-w-[1320px] gap-4 py-4"><PageHeader title="System" description={finding} window={win} onWindow={setWin} refreshing={monitoring.refreshing || chartMonitoring.refreshing} onRefresh={refresh} />{(monitoring.error ?? chartMonitoring.error) && <MetricSection title="Monitoring unavailable" error={monitoring.error ?? chartMonitoring.error} retry={refresh} />}<KpiStrip items={[{label: 'Requests', value: monitoring.data ? compact(requests) : '—', title: int(requests)}, {label: '5xx rate', value: requests ? pct(errors / requests) : '—'}, {label: 'p95 (HTTP)', value: ms(monitoring.data?.window_p95_ms ?? weightedPercentile(points, 'p95_ms', .95)), sub: monitoring.data?.window_p95_ms!=null?`${win} window aggregate`:`${win} · request-weighted interval p95`, title: 'Window percentile when available; otherwise request-weighted p95 of interval p95s'}, {label: 'p99', value: ms(monitoring.data?.window_p99_ms ?? weightedPercentile(points, 'p99_ms', .99)), sub: monitoring.data?.window_p99_ms!=null?`${win} window aggregate`:`${win} · request-weighted interval p99`, title: 'Window percentile when available; otherwise request-weighted p99 of interval p99s'}, {label: 'Avg instances', value: avg == null ? '—' : decimal(avg, 2)}]} /><LazySeriesChart partialLast={(monitoring.data?.alignment_seconds??86400)<86400} windowLabel={win} hourly={win === '24h'} title="HTTP latency" rows={chartPoints} series={latency} format="duration" /><div className="grid gap-4 lg:grid-cols-2"><LazySeriesChart compact height={170} partialLast={(monitoring.data?.alignment_seconds??86400)<86400} windowLabel={win} hourly={win === '24h'} bars title="Requests and 5xx" rows={chartPoints} series={[{key: 'request_count', label: 'Requests', color: 'var(--console-data)'}, {key: 'error_count', label: '5xx', color: 'var(--console-brick)'}]} /><LazySeriesChart compact height={170} partialLast={(monitoring.data?.alignment_seconds??86400)<86400} windowLabel={win} hourly={win === '24h'} integer title="Instances" rows={chartPoints} series={[{key: 'instances', label: 'Instances', color: 'var(--console-data)'}]} /><LazySeriesChart compact height={170} partialLast={(monitoring.data?.alignment_seconds??86400)<86400} windowLabel={win} hourly={win === '24h'} title="Container startup p95" rows={chartPoints} series={[{key: 'startup_p95_ms', label: 'Startup p95', color: 'var(--console-data)'}]} format="duration" /><LazySeriesChart compact height={170} partialLast={(monitoring.data?.alignment_seconds??86400)<86400} windowLabel={win} hourly={win === '24h'} title="CPU / memory p95" rows={chartPoints} series={[{key: 'cpu_p95', label: 'CPU p95', color: 'var(--console-data)'}, {key: 'memory_p95', label: 'Memory p95', color: 'var(--console-muted)'}]} format="percent" /></div>{monitoring.data?.delivery_source !== 'cloudflare-direct' && <MetricSection title="Snapshot">{auth.role === 'founder' ? <RunControl /> : <p className="text-sm text-muted-foreground">Founder only</p>}</MetricSection>}</div>;
}
