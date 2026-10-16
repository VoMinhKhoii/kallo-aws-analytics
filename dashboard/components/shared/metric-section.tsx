"use client";
import type { ReactNode } from 'react';
import { ChartSkeleton } from './chart-skeleton';
export function MetricSection({ title, loading, error, empty, retry, children }: { title: string; loading?: boolean; error?: string | null; empty?: boolean; retry?: () => void; children?: ReactNode }) {
  if (loading) return <ChartSkeleton />;
  return <section className="min-w-0 border-b border-border py-4"><h2 className="mb-3 text-[15px] font-semibold">{title}</h2>{error ? <div role="alert" className="text-sm text-[var(--console-brick)]">{error}{retry && <button className="ml-3 underline" onClick={retry}>Retry</button>}</div> : empty ? <p className="text-[13px] text-muted-foreground">Nothing recorded in this window.</p> : children}</section>;
}
