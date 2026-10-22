"use client";
import type { ReactNode } from 'react';
import { ChartSkeleton } from './chart-skeleton';
export function MetricSection({ title, description, action, card = false, loading, error, empty, retry, children }: { title: string; description?: ReactNode; action?: ReactNode; card?: boolean; loading?: boolean; error?: string | null; empty?: boolean; retry?: () => void; children?: ReactNode }) {
  if (loading) return <ChartSkeleton />;
  return <section className={card ? "flex h-full min-w-0 flex-col rounded-xl border border-border bg-card px-4 py-3" : "min-w-0 border-b border-border py-4"}><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-[15px] font-semibold">{title}</h2>{description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}</div>{action}</div>{error ? <div role="alert" className="text-sm text-[var(--console-brick)]">{error}{retry && <button className="ml-3 underline" onClick={retry}>Retry</button>}</div> : empty ? <p className="text-[13px] text-muted-foreground">Nothing recorded in this window.</p> : children}</section>;
}
