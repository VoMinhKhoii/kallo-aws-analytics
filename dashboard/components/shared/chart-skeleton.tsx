export function ChartSkeleton({ height = 246 }: { height?: number }) {
  return <div aria-label="Loading chart" role="status" className="animate-pulse border-t border-border pt-5" style={{ height }}><div className="mb-6 h-4 w-36 rounded-[3px] bg-secondary" /><div className="h-[70%] border-b border-border bg-[var(--console-surface)]" /></div>;
}
