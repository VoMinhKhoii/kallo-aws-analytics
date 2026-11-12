"use client";
import { useState } from 'react';
import { CaretRight } from "@phosphor-icons/react/ssr";
import type { IngredientMappingRow } from '@/app/lib/types';
import { decimal, int } from '@/lib/ai-usage/format';
import { TablePager } from '@/components/console/console';
export function DemandList({ rows, mappings }: { rows: {ingredient_query: string; count: number}[]; mappings: IngredientMappingRow[] }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byQuery = new Map(mappings.map(m => [m.ingredient_query, m]));
  const cols = 'grid grid-cols-[16px_minmax(0,1fr)_80px_120px] items-start gap-x-4';
  return <><div role="table" aria-label="Ingredient demand" className="text-sm">
    <div role="row" className={`${cols} h-8 items-center border-b border-border text-xs text-[var(--console-faint)]`}><span /><span role="columnheader">Ingredient, chosen food</span><span role="columnheader" className="text-right">Queries</span><span role="columnheader" className="text-right">Accepted</span></div>
    {rows.slice((page - 1)*15, page*15).map(r => {
    const m = byQuery.get(r.ingredient_query);
    const open = expanded.has(r.ingredient_query);
    const chosen = m?.chosen?.food_id ?? m?.chosen?.name;
    return <div key={r.ingredient_query} role="rowgroup" className="border-b border-border">
      <button type="button" role="row" aria-expanded={open} onClick={() => setExpanded(previous => {
        const next = new Set(previous);
        if (open) next.delete(r.ingredient_query); else next.add(r.ingredient_query);
        return next;
      })} className={`${cols} w-full py-3 text-left transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-accent)]`}>
        <CaretRight aria-hidden="true" className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <span role="cell" className="grid min-w-0 gap-0.5"><span className="break-words font-medium">{r.ingredient_query}</span><span className="break-words text-muted-foreground">{m?.chosen?.name ?? m?.chosen?.food_id ?? 'No chosen food'}</span></span>
        <span role="cell" className="tabular text-right">{int(r.count)}</span>
        <span role="cell" className="tabular text-right">{m ? <>{int(m.accepted_count)}<span className="text-muted-foreground"> / {int(m.decision_count)}</span></> : <span className="text-muted-foreground">No mapping</span>}</span>
      </button>
      {open && <div className="pb-4 pl-8">{m?.candidates.length ? <table className="w-full max-w-2xl text-sm"><thead className="text-xs text-[var(--console-faint)]"><tr><th className="w-14 py-1.5 text-left font-normal">Rank</th><th className="py-1.5 text-left font-normal">Candidate food</th><th className="w-24 py-1.5 text-right font-normal">Similarity</th></tr></thead>
        <tbody>{m.candidates.map(c => { const picked = chosen != null && (c.food_id ?? c.name) === chosen; return <tr key={`${c.rank}-${c.food_id ?? c.name}`} className="border-t border-border">
          <td className="tabular py-2 text-muted-foreground">{int(c.rank)}</td>
          <td className={`py-2 break-words ${picked ? 'text-foreground' : 'text-muted-foreground'}`}>{c.name ?? c.food_id ?? 'Unknown'}{picked && <span className="ml-2 text-xs text-[var(--console-green)]">chosen</span>}</td>
          <td className="tabular py-2 text-right text-muted-foreground">{c.similarity != null ? decimal(c.similarity, 3) : '—'}</td>
        </tr>; })}</tbody></table> : <p className="text-sm text-muted-foreground">No candidates recorded.</p>}</div>}
    </div>;
  })}</div><TablePager page={page} pageSize={15} total={rows.length} onPageChange={setPage} label="ingredient demand" /></>;
}
