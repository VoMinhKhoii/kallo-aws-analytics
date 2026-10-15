"use client";
import { useState } from 'react';
import type { IngredientMappingRow } from '@/app/lib/types';
import { TablePager } from '@/components/console/console';
export function DemandList({ rows, mappings }: { rows: {ingredient_query: string; count: number}[]; mappings: IngredientMappingRow[] }) {
  const [page, setPage] = useState(1); const byQuery = new Map(mappings.map(m => [m.ingredient_query, m]));
  return <><div className="divide-y divide-border">{rows.slice((page - 1)*15, page*15).map(r => { const m = byQuery.get(r.ingredient_query); return <details key={r.ingredient_query} className="py-3 text-sm"><summary className="cursor-pointer break-words"><span className="font-medium">{r.ingredient_query}</span><span className="tabular ml-3 text-xs text-muted-foreground">{r.count} queries · {m ? `${m.accepted_count}/${m.decision_count} accepted` : 'No mapping'}</span><p className="mt-1 text-xs text-muted-foreground">{m?.chosen?.name ?? m?.chosen?.food_id ?? 'No chosen food'}</p></summary><ul className="mt-3 grid gap-2 pl-4 text-xs text-muted-foreground">{m?.candidates.length ? m.candidates.map(c => <li key={`${c.rank}-${c.food_id ?? c.name}`} className="break-words">Rank {c.rank} · {c.name ?? c.food_id ?? 'Unknown'}{c.similarity != null && ` · ${c.similarity.toFixed(3)}`}</li>) : <li>No candidates recorded.</li>}</ul></details>; })}</div><TablePager page={page} pageSize={15} total={rows.length} onPageChange={setPage} label="ingredient demand" /></>;
}
