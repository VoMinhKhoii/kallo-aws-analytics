"use client";
import { int } from '@/lib/ai-usage/format';
import { useState } from 'react';
import type { CorpusReverseLookupRow, ImplausibleFoodRow } from '@/app/lib/types';
import { TablePager } from '@/components/console/console';
import { MetricSection } from '@/components/shared/metric-section';
export function CatalogLists({ rows, flags, errors, retry }: { rows: CorpusReverseLookupRow[]; flags: ImplausibleFoodRow[]; errors: (string | null | undefined)[]; retry: () => void }) {
  const [page, setPage] = useState(1);
  return <><MetricSection title="Corpus coverage" error={errors[0]} retry={retry} empty={!rows.length}><div className="divide-y divide-border">{rows.slice((page-1)*12,page*12).map(r => <article key={r.food_id ?? `${r.food_name}-${r.source}`} className="py-3 text-sm"><p className="break-words font-medium">{r.food_name ?? r.food_id ?? 'Unknown food'}</p><p className="tabular mt-1 text-xs text-muted-foreground">{int(r.decision_count)} decisions · {int(r.query_count)} summed daily queries · {r.source ?? 'No source'}</p><p className="mt-1 break-words text-xs text-muted-foreground">{r.query_examples.join(' · ')}</p></article>)}</div><TablePager page={page} pageSize={12} total={rows.length} onPageChange={setPage} label="corpus" /></MetricSection><MetricSection title="Catalog checks" error={errors[1]} retry={retry} empty={!flags.length}>{flags.map((r,i) => <article key={r.id ?? i} className="border-b border-border py-3 text-sm"><p className="break-words">{r.name_en ?? `Food ${r.id ?? 'unknown'}`}</p><p className="mt-1 text-xs text-muted-foreground">{r.reasons.join(' · ')}</p></article>)}</MetricSection></>;
}
