import { Cell } from './kpi-cell';
/** Bare figures in a row: no boxes, just space between them. */
export function KpiStrip({ items }: { items: { label: string; value: string; sub?: string; delta?: import("react").ReactNode; error?: string | null; title?: string }[] }) {
  return <section aria-label="Summary" className="grid grid-cols-2 gap-x-8 gap-y-6 py-4 sm:grid-cols-3 xl:flex xl:gap-10">{items.map(i => <div key={i.label} className="min-w-0 xl:flex-1"><Cell delta={i.delta} title={i.title} label={i.label} value={i.error ? '—' : i.value} sub={i.error ?? i.sub} /></div>)}</section>;
}
