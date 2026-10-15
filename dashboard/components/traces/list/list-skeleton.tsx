export function ListSkeleton() {
  return <div role="status" aria-label="Loading traces" className="mx-auto grid max-w-[1320px] gap-4 py-4"><div className="h-10 animate-pulse bg-secondary/30"/><div className="h-10 animate-pulse rounded-md border border-border bg-secondary/30"/><div className="h-8 animate-pulse bg-secondary/30"/><div className="h-4 w-32 animate-pulse bg-secondary/30"/><div>{Array.from({length:10},(_,i)=><div key={i} className="h-14 animate-pulse border-b border-border bg-secondary/30"/>)}</div></div>;
}
