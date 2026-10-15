"use client";
import { TrendChart } from '@/components/ai-usage/trend-chart';
import { compact, decimal, ms, msAxis, pct } from '@/lib/ai-usage/format';
import type { ModelMeta } from '@/lib/ai-usage/models';
export type Series = { key: string; label: string; color: string };
export function SeriesChart({ title, rows, series, format = 'number', bars = false, hourly = false }: {
  title: string;
  rows: ({date: string} & Record<string, unknown>)[];
  series: Series[];
  format?: 'number' | 'percent' | 'duration';
  bars?: boolean;
  hourly?: boolean;
}) {
  const fmt = format === 'percent' ? pct : format === 'duration' ? ms : bars ? compact : decimal;
  const axis = format === 'percent' ? pct : format === 'duration' ? msAxis : compact;
  const models: ModelMeta[] = series.map(s => ({...s, id: s.key, vendor: 'Other', role: ''}));
  return <TrendChart title={title} rows={rows} models={models} format={fmt} axis={axis} seriesOnly bars={bars} hourly={hourly} />;
}
