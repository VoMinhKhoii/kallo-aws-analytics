export default function Loading() {
  return <div role="status" aria-label="Loading login" className="mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-[360px] content-center gap-4"><div className="mb-4 h-9 w-44 animate-pulse rounded bg-secondary" />{[0,1].map(i => <div key={i}><div className="mb-2 h-3 w-16 animate-pulse bg-secondary" /><div className="h-10 animate-pulse rounded-md bg-secondary" /></div>)}<div className="h-10 animate-pulse rounded-md bg-secondary" /></div>;
}
