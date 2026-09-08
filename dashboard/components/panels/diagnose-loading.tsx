export function DiagnoseLoading({ title }: { title: string }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${title}`} className="animate-pulse py-6">
      <div className="h-3 w-48 rounded bg-muted" />
      <div className="mt-3 h-8 w-72 max-w-full rounded bg-muted" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-24 rounded-lg border bg-card" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <div className="h-80 rounded-lg border bg-card" />
        <div className="h-80 rounded-lg border bg-card" />
      </div>
    </div>
  );
}
