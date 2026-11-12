"use client";
import { ChartSkeleton } from '@/components/shared/chart-skeleton';
import { preloaded } from './preloaded';
// recharts downloads as soon as a page that charts loads, alongside its data.
export const LazySeriesChart = preloaded(() => import('./series-chart').then(m => m.SeriesChart), () => <ChartSkeleton />);
