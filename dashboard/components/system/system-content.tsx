"use client";
import { floorHour, hourRange } from '@/lib/windows';
import { weightedPercentile } from '@/lib/ai-usage/chart-data';
import { compact, decimal, int, ms, pct } from '@/lib/ai-usage/format';
import { useRefocus } from '@/lib/use-refocus';
import { useEffect, useMemo, useState } from 'react';
import { prefetch } from '@/lib/prefetch';
import { rangeWindow, type ConsoleRange } from '@/components/console/console';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { MetricTabs, type MetricTab } from '@/components/shared/metric-tabs';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { useCloudMonitoring } from '@/lib/use-cloud-monitoring';
import { useSessionRole } from '@/lib/use-auth';
import { RunControl } from './run-control';
import { HEALTH_URL, PipelinePanel, usePipelineHealth } from './pipeline-health';
export function System({win, setWin}: {win: string; setWin: (v: string) => void}) {
  const [asOf, setAsOf] = useState(() => new Date());
  const [tab, setTab] = useState('requests');
  const window = useMemo(() => rangeWindow(win as ConsoleRange, asOf), [win, asOf]);
  const monitoring = useCloudMonitoring(window.from, window.to);
  const chartMonitoring = useCloudMonitoring(win === '24h' ? floorHour(window.from) : window.from, window.to, win === '24h');
  const auth = useSessionRole();
  const health = usePipelineHealth(auth.role === 'founder');
  // Founder-only; started before the role is known so it is not a second round trip.
  useEffect(() => prefetch(HEALTH_URL), []);
  const refresh = () => { setAsOf(new Date()); monitoring.refresh(); chartMonitoring.refresh(); };
  useRefocus(refresh);
  if (monitoring.loading || win === '24h' && chartMonitoring.loading) return <PageSkeleton title="System" cells={5} charts={1} />;
  const points = (monitoring.data?.series ?? []).map(p => ({...p, date: p.timestamp}));
  // Monitoring timestamps mark interval ends; display each interval at its UTC hour origin.
  const chartSeries = (win === '24h' ? chartMonitoring.data?.series ?? [] : monitoring.data?.series ?? []);
  const hourlyPoints = new Map(chartSeries.map(p => [floorHour(new Date(Date.parse(p.timestamp) - 1).toISOString()), p]));
  const chartPoints = win === '24h' ? hourRange(window.to).map(date => ({...hourlyPoints.get(date), date})) : points;
  const requests = points.reduce((n,p) => n + (p.request_count ?? 0), 0); const errors = points.reduce((n,p) => n + (p.error_count ?? 0), 0);
  const routeStore = monitoring.data?.route_source === 'cloud-logging-dynamodb';
  const latency = routeStore ? [{key: 'ai_p95_ms', label: 'Analyze-meal p95', color: 'var(--console-data)'}, {key: 'ai_p99_ms', label: 'Analyze-meal p99', color: 'var(--console-data-2)'}, {key: 'normal_p95_ms', label: 'Non-AI p95', color: 'var(--console-data-2)'}, {key: 'normal_p99_ms', label: 'Non-AI p99', color: 'var(--console-data-2)'}] : [{key: 'p95_ms', label: 'p95', color: 'var(--console-data)'}, {key: 'p99_ms', label: 'p99', color: 'var(--console-data-2)'}];
  const mean = (key: 'instances' | 'cpu_p95' | 'startup_p95_ms') => { const v = points.map(p => p[key]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null; };
  const avg = mean('instances'), cpu = mean('cpu_p95'), startup = mean('startup_p95_ms');
  const p95 = monitoring.data?.window_p95_ms ?? weightedPercentile(points, 'p95_ms', .95), p99 = monitoring.data?.window_p99_ms ?? weightedPercentile(points, 'p99_ms', .99);
  const pctile = monitoring.data?.window_p95_ms != null ? 'Window percentile' : 'Request-weighted percentile of interval percentiles';
  const tabs: MetricTab[] = [
    {key: 'requests', label: 'Requests', value: monitoring.data ? compact(requests) : '—', title: int(requests)},
    {key: 'errors', label: '5xx rate', value: requests ? pct(errors / requests) : '—', title: `${int(errors)} of ${int(requests)} requests returned 5xx`},
    {key: 'latency', label: 'p95 latency', value: ms(p95), title: `${pctile}. p99 ${ms(p99)}`},
    {key: 'instances', label: 'Avg instances', value: avg == null ? '—' : decimal(avg, 2)},
    {key: 'cpu', label: 'Avg CPU p95', value: cpu == null ? '—' : pct(cpu, 0)},
    {key: 'startup', label: 'Avg startup p95', value: ms(startup)},
    ...(auth.role === 'founder' ? [{key: 'meals', label: 'Meal success, 24 h', value: pct(health.data?.success.find(r => r.window === '24h')?.rate), title: 'Meal pipeline: success, latency and the most common errors'}] : []),
  ];
  const partial = (monitoring.data?.alignment_seconds ?? 86400) < 86400;
  const chart = {bare: true, compact: true, height: 340, partialLast: partial, windowLabel: win, hourly: win === '24h'} as const;
  const errorRows = chartPoints.map(p => ({date: p.date, rate: p.request_count ? (p.error_count ?? 0) / p.request_count : null}));
  return <div className="grid gap-8"><PageHeader title="System" window={win} onWindow={setWin} refreshing={monitoring.refreshing || chartMonitoring.refreshing} onRefresh={refresh} />{(monitoring.error ?? chartMonitoring.error) && <MetricSection title="Monitoring unavailable" error={monitoring.error ?? chartMonitoring.error} retry={refresh} />}
    <MetricTabs tabs={tabs} value={tab} onChange={setTab}>
      {tab === 'requests' && <LazySeriesChart {...chart} integer title="Requests and 5xx" rows={chartPoints} series={[{key: 'request_count', label: 'Requests', color: 'var(--console-data)'}, {key: 'error_count', label: '5xx', color: 'var(--console-brick)'}]} />}
      {tab === 'errors' && <LazySeriesChart {...chart} title="5xx rate" format="percent" rows={errorRows} series={[{key: 'rate', label: '5xx rate', color: 'var(--console-brick)'}]} />}
      {tab === 'latency' && <LazySeriesChart {...chart} title="HTTP latency, p95 and p99" format="duration" rows={chartPoints} series={latency} />}
      {tab === 'instances' && <LazySeriesChart {...chart} integer step title="Instances" rows={chartPoints} series={[{key: 'instances', label: 'Instances', color: 'var(--console-data)'}]} />}
      {tab === 'cpu' && <LazySeriesChart {...chart} title="CPU and memory p95" format="percent" rows={chartPoints} series={[{key: 'cpu_p95', label: 'CPU p95', color: 'var(--console-data)'}, {key: 'memory_p95', label: 'Memory p95', color: 'var(--console-data-2)'}]} />}
      {tab === 'meals' && <PipelinePanel health={health} />}
      {tab === 'startup' && <LazySeriesChart {...chart} title="Container startup p95" format="duration" rows={chartPoints} series={[{key: 'startup_p95_ms', label: 'Startup p95', color: 'var(--console-data)'}]} />}
    </MetricTabs>
{monitoring.data?.delivery_source !== 'cloudflare-direct' && <MetricSection title="Snapshot">{auth.role === 'founder' ? <RunControl /> : <p className="text-sm text-muted-foreground">Founder only</p>}</MetricSection>}</div>;
}
