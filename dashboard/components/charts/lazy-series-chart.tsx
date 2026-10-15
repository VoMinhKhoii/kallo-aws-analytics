"use client";
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';
export const LazySeriesChart = dynamic(() => import('./series-chart').then(m => m.SeriesChart), { ssr: false, loading: () => <ChartSkeleton /> });
