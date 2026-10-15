"use client";
import { TrendChart } from '@/components/ai-usage/trend-chart';
import type { ModelMeta } from '@/lib/ai-usage/models';
export type Series = { key: string; label: string; color: string };
export function SeriesChart({ title, rows, series, format = 'number' }: {
  title: string;
  rows: ({date: string} & Record<string, unknown>)[];
  series: Series[];
  format?: 'number' | 'percent' | 'duration';
}) {
  const fmt = (n: number) => {
    if (format === 'percent') return `${(n * 100).toFixed(1)}%`;
    if (format === 'duration') return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
    return n.toLocaleString('en-US', {maximumFractionDigits: 1});
  };
  const models: ModelMeta[] = series.map(s => ({...s, id: s.key, vendor: 'Other', role: ''}));
  return <TrendChart title={title} rows={rows} models={models} format={fmt} axis={fmt} seriesOnly />;
}
