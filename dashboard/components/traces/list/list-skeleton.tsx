export function ListSkeleton() {
  return <div role="status" aria-label="Loading traces" className="grid gap-6 pt-7"><div className="h-10 animate-pulse bg-secondary/30"/><div className="h-10 animate-pulse border-b border-border"/><div className="h-8 animate-pulse bg-secondary/30"/><div className="h-4 w-32 animate-pulse bg-secondary/30"/><div>{Array.from({length:10},(_,i)=><div key={i} className="h-14 animate-pulse border-b border-border bg-secondary/30"/>)}</div></div>;
}
