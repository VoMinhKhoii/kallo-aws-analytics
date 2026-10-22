"use client";
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { IngredientMappingRow } from '@/app/lib/types';
import { decimal, int } from '@/lib/ai-usage/format';
import { TablePager } from '@/components/console/console';
export function DemandList({ rows, mappings }: { rows: {ingredient_query: string; count: number}[]; mappings: IngredientMappingRow[] }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byQuery = new Map(mappings.map(m => [m.ingredient_query, m]));
  return <><div className="divide-y divide-border">{rows.slice((page - 1)*15, page*15).map(r => {
    const m = byQuery.get(r.ingredient_query);
    const open = expanded.has(r.ingredient_query);
    return <div key={r.ingredient_query} className="text-sm">
      <button type="button" aria-expanded={open} onClick={() => setExpanded(previous => {
        const next = new Set(previous);
        if (open) next.delete(r.ingredient_query); else next.add(r.ingredient_query);
        return next;
      })} className="flex w-full items-start gap-2 py-4 text-left hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">
        <ChevronRight aria-hidden="true" className={`mt-1 size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 break-words"><span className="font-medium">{r.ingredient_query}</span><span className="tabular ml-4 text-xs text-muted-foreground">{int(r.count)} queries · {m ? `${int(m.accepted_count)}/${int(m.decision_count)} accepted` : 'No mapping'}</span><span className="mt-1 block text-xs text-muted-foreground">{m?.chosen?.name ?? m?.chosen?.food_id ?? 'No chosen food'}</span></span>
      </button>
      {open && <ul className="mb-4 grid gap-2 pl-6 text-xs text-muted-foreground">{m?.candidates.length ? m.candidates.map(c => <li key={`${c.rank}-${c.food_id ?? c.name}`} className="break-words">Rank {int(c.rank)} · {c.name ?? c.food_id ?? 'Unknown'}{c.similarity != null && ` · ${decimal(c.similarity, 3)}`}</li>) : <li>No candidates recorded.</li>}</ul>}
    </div>;
  })}</div><TablePager page={page} pageSize={15} total={rows.length} onPageChange={setPage} label="ingredient demand" /></>;
}
