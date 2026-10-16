import { ChartSkeleton } from './chart-skeleton';
export function PageSkeleton({ title = 'page', charts = 2, cells = 6, rows = false }: {
  title?: string; charts?: number; cells?: number; rows?: boolean;
}) {
  return <div aria-label={`Loading ${title}`} role="status" className="mx-auto grid max-w-[1320px] gap-3 py-4">
    <div className="flex h-11 items-start justify-between gap-3">
      <div className="h-7 w-36 animate-pulse rounded bg-secondary" />
      <div className="h-9 w-40 animate-pulse rounded bg-secondary" />
    </div>
    {cells > 0 && <div className="grid grid-cols-2 rounded-xl border border-border bg-card sm:grid-cols-3 xl:flex">
      {Array.from({length: cells}, (_, i) => <div key={i} className="h-[84px] min-w-0 flex-1 animate-pulse p-4">
        <div className="h-3 w-20 max-w-full bg-secondary" />
        <div className="mt-3 h-6 w-24 max-w-full bg-secondary" />
      </div>)}
    </div>}
    {Array.from({length: charts}, (_, i) => <ChartSkeleton key={i} />)}
    {rows && <div>{Array.from({length: 5}, (_, i) => <div key={i} className="h-16 animate-pulse border-b border-border bg-secondary/20" />)}</div>}
  </div>;
}
