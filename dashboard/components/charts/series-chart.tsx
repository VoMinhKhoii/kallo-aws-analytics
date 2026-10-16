"use client";
import { TrendChart } from '@/components/ai-usage/trend-chart';
import { compact, decimal, int, ms, pct } from '@/lib/ai-usage/format';
import type { ModelMeta } from '@/lib/ai-usage/models';
export type Series = { key: string; label: string; color: string };
export function SeriesChart({ title, subtitle, rows, series, format = 'number', bars = false, hourly = false, stacked = false, step = false, integer = false, partialLast = hourly, windowLabel, seriesSubs }: {
  title: string;
  subtitle?: string;
  rows: ({date: string} & Record<string, unknown>)[];
  series: Series[];
  format?: 'number' | 'percent' | 'duration';
  bars?: boolean;
  hourly?: boolean;
  partialLast?: boolean; stacked?: boolean; step?: boolean; integer?: boolean; windowLabel?: string; seriesSubs?: Record<string,string>;
}) {
  const fmt = format === 'percent' ? pct : format === 'duration' ? ms : integer ? int : bars ? compact : decimal;
  const axis = format === 'percent' ? (v:number)=>pct(v,0) : format === 'duration' ? (v:number)=>`${Math.round(v/1000)} s` : compact;
  const models: ModelMeta[] = series.map(s => ({...s, id: s.key, vendor: 'Other', role: ''}));
  return <TrendChart title={title} subtitle={subtitle} rows={rows} models={models} format={fmt} axis={axis} seriesOnly bars={bars} hourly={hourly} partialLast={partialLast} stacked={stacked} step={step} integer={integer} totals={bars} windowLabel={windowLabel} durationAxis={format==='duration'} percent={format==='percent'} seriesSubs={seriesSubs} />;
}
