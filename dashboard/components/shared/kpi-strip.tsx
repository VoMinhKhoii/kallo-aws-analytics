import { Cell } from './kpi-cell';
export function KpiStrip({ items }: { items: { label: string; value: string; sub?: string; error?: string | null; title?: string }[] }) {
  return <section aria-label="Summary" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3 xl:flex xl:divide-x xl:divide-border">{items.map(i => <div key={i.label} className="min-w-0 flex-1"><Cell title={i.title} label={i.label} value={i.error ? '—' : i.value} sub={i.error ?? i.sub} /></div>)}</section>;
}
