export function ChartSkeleton({ height = 246 }: { height?: number }) {
  return <div aria-label="Loading chart" role="status" className="animate-pulse rounded-xl border border-border bg-card p-4" style={{ height }}><div className="mb-6 h-4 w-36 rounded bg-secondary" /><div className="h-[65%] border-b border-l border-border bg-secondary/30" /></div>;
}
