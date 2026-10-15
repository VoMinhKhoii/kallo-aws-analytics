"use client";
export function FilterChips({ value, onChange, items }: {value:string; onChange:(v:string)=>void; items:{value:string;label:string}[]}) {
  return <div role="group" aria-label="Status filter" className="flex flex-wrap gap-2">{items.map(i => <button key={i.value} aria-pressed={value === i.value} onClick={() => onChange(i.value)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary aria-pressed:bg-secondary aria-pressed:text-foreground">{i.label}</button>)}</div>;
}
