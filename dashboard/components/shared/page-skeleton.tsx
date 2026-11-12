import { ChartSkeleton } from './chart-skeleton';
export function PageSkeleton({ title = 'page', charts = 2, cells = 6, rows = false }: {
  title?: string; charts?: number; cells?: number; rows?: boolean;
}) {
  return <div aria-label={`Loading ${title}`} role="status" className="grid gap-6">
    <div className="grid gap-3 pt-7">
      <div className="h-8 w-40 animate-pulse rounded-[3px] bg-secondary" />
      <div className="h-5 w-48 animate-pulse rounded-[3px] bg-secondary" />
    </div>
    {cells > 0 && <div className="grid grid-cols-2 gap-x-8 gap-y-6 py-4 sm:grid-cols-3 xl:flex xl:gap-10">
      {Array.from({length: cells}, (_, i) => <div key={i} className="h-[76px] min-w-0 flex-1 animate-pulse">
        <div className="h-3 w-20 max-w-full rounded-[3px] bg-secondary" />
        <div className="mt-3 h-8 w-24 max-w-full rounded-[3px] bg-secondary" />
      </div>)}
    </div>}
    {Array.from({length: charts}, (_, i) => <ChartSkeleton key={i} />)}
    {rows && <div>{Array.from({length: 5}, (_, i) => <div key={i} className="h-11 animate-pulse border-b border-border" />)}</div>}
  </div>;
}
