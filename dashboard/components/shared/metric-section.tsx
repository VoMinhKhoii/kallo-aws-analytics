"use client";
import type { ReactNode } from 'react';
import { ChartSkeleton } from './chart-skeleton';
/** A titled region under a 1px rule. No card and no subtitle. */
export function MetricSection({ title, action, loading, error, empty, emptyLabel = "Nothing recorded in this window.", retry, children }: { title: string; action?: ReactNode; loading?: boolean; error?: string | null; empty?: boolean; emptyLabel?: string; retry?: () => void; children?: ReactNode }) {
  if (loading) return <ChartSkeleton />;
  return <section className="flex min-w-0 flex-col border-t border-border pt-5"><div className="mb-4 flex min-h-6 items-center justify-between gap-4"><h2 className="min-w-0 text-base font-medium">{title}</h2>{action}</div>{error ? <div role="alert" className="text-sm text-foreground mark-bad">{error}{retry && <button className="ml-4 underline" onClick={retry}>Retry</button>}</div> : empty ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : children}</section>;
}
