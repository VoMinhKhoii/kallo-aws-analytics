"use client";
/** Single-choice filter as a segmented track; the selected option sits raised on the card colour. */
export function FilterChips({ value, onChange, items, label = "Status filter" }: {value:string; onChange:(v:string)=>void; items:{value:string;label:string}[]; label?: string}) {
  return <div role="group" aria-label={label} className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-secondary p-0.5">{items.map(i => <button key={i.value} type="button" aria-pressed={value === i.value} onClick={() => onChange(i.value)} className="h-7 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] aria-pressed:bg-card aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-[var(--shadow-raised)]">{i.label}</button>)}</div>;
}
