"use client";
import Link from 'next/link';
import { useState } from 'react';
import { int, pct } from '@/lib/ai-usage/format';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { UrlTabs } from '@/components/shared/url-tabs';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { BarList } from '@/components/console/console';
import { useIngredients } from './use-ingredients';
import { DemandList } from './demand-list';
import { CatalogLists } from './catalog-lists';
const Histogram = dynamic(() => import('./histogram').then(m => m.Histogram), {ssr: false, loading: () => <ChartSkeleton height={300} />});
export function Ingredients({win, setWin, tab, setTab}: {win: string; setWin: (v: string) => void; tab: string; setTab: (v: string) => void}) {
  const {chartMatches, chartError, bundle, mappings, demand, gaps, ranks, reverse, macros, matches, flags} = useIngredients(win);
  const err = (name: keyof typeof bundle.errors) => bundle.errors[name] ?? bundle.error;
  const decisions = mappings.reduce((n,r) => n + r.decision_count, 0); const accepted = mappings.reduce((n,r) => n + r.accepted_count,0);
  const ranked = ranks.reduce((n,r) => n + r.count,0); const first = ranks.filter(r => r.selected_rank === 1).reduce((n,r) => n + r.count,0);
  const unmatched = matches.reduce((n,r) => n + r.unmatched_count,0);
  const matched = matches.reduce((n,r)=>n+r.matched_count,0);
  const rate = (a: number, b: number) => pct(b ? a / b : null);
  const [allGaps, setAllGaps] = useState(false);
  if (bundle.loading) return <PageSkeleton title="Ingredients" cells={4} charts={1} rows />;
  return <div className="mx-auto grid max-w-[1320px] gap-4 py-4"><PageHeader title="Ingredients" window={win} onWindow={setWin} refreshing={bundle.refreshing} onRefresh={bundle.refresh} /><UrlTabs value={tab} onChange={setTab} items={[{value:'matching',label:'Matching'},{value:'catalog',label:'Catalog'}]}>{tab === 'matching' ? <><KpiStrip items={[{label:'Decisions',value:int(decisions),sub:'Top 50 queries per day',error:err('ingredient_mappings')},{label:'Acceptance',value:rate(accepted,decisions),sub:'Top 50 queries per day',error:err('ingredient_mappings')},{label:'First choice',value:rate(first,ranked),error:err('ingredient_rank_distribution')},{label:'Match rate',value:rate(matched,matched+unmatched),error:err('match_rate')}]} /><div className="grid gap-4 lg:grid-cols-3"><div className="min-w-0 lg:col-span-2">{(chartError ?? err('match_rate')) ? <MetricSection card title="Match rate" error={chartError ?? err('match_rate')} retry={bundle.refresh} /> : <LazySeriesChart compact height={236} windowLabel={win} hourly={win === '24h'} bars stacked title="Ingredient matches" rows={chartMatches ?? matches} series={[{key:'matched_count',label:'Matched',color:'var(--console-data)'},{key:'unmatched_count',label:'Unmatched',color:'var(--console-brick)'}]} />}</div><MetricSection card title="Accepted rank by pool size" description="Which candidate the selector accepted, by how many it chose from" error={err('ingredient_rank_distribution')} retry={bundle.refresh} empty={!ranks.length}><div className="-mx-4"><BarList items={ranks.map(r => ({label:`Pool ${int(r.pool_size)} · rank ${int(r.selected_rank)}`,value:r.count,detail:`${pct(r.share)} within pool`,tone:r.selected_rank === 1 ? 'data' : 'neutral'}))} /></div></MetricSection></div>
<div className="grid items-start gap-4 lg:grid-cols-3"><div className="min-w-0 lg:col-span-2"><MetricSection card title="Demand" description="Most requested ingredients and the food rows they were matched to" error={err('ingredient_demand') ?? err('ingredient_mappings')} retry={bundle.refresh} empty={!demand.length}><DemandList rows={demand} mappings={mappings} /></MetricSection></div>{/* A rail beside the long demand list: pinned so the queries to fix stay in view. */}<div className="min-w-0 lg:sticky lg:top-[68px]"><MetricSection card title="Unmatched queries" description={gaps.length ? `${int(gaps.length)} queries the matcher rejected, most frequent first` : undefined} error={err('ingredient_gaps')} retry={bundle.refresh} empty={!gaps.length}><div className="-mx-4 divide-y divide-border border-t border-border">{gaps.slice(0, allGaps ? 20 : 5).map((r,i)=><div key={i} className="grid gap-1 px-4 py-2"><div className="flex items-baseline justify-between gap-4"><span className="min-w-0 truncate text-sm" title={r.ingredient_query}>{r.ingredient_query}</span><span className="tabular shrink-0 text-sm">{int(r.count)}</span></div><div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"><span className="mark-warn">{r.verdict} · {r.reject_bucket}</span><span>{r.last_seen?new Date(r.last_seen).toISOString().slice(5,16).replace('T',' ')+' UTC':r.date??'not recorded'}</span><Link className="ml-auto text-foreground hover:underline" href={r.last_trace_id?`/traces/${encodeURIComponent(r.last_trace_id)}?w=${win}`:`/traces?w=${win}&q=${encodeURIComponent(r.ingredient_query)}`}>{r.last_trace_id?'Trace →':'Find traces →'}</Link></div></div>)}</div>{gaps.length > 5 && <button type="button" onClick={() => setAllGaps(v => !v)} className="mt-auto pt-4 text-left text-sm text-muted-foreground hover:text-foreground">{allGaps ? 'Show fewer' : `Show all ${int(Math.min(gaps.length, 20))}`}</button>}</MetricSection></div></div>
</> : <><CatalogLists rows={reverse} flags={flags} errors={[err('corpus_reverse_lookup'),err('implausible_foods')]} retry={bundle.refresh} /><MetricSection title="Meal macro distribution" error={err('macro_distributions')} retry={bundle.refresh} empty={!macros.length}><Histogram rows={macros} /></MetricSection><p className="text-xs text-muted-foreground">Catalog checks are a current snapshot; corpus coverage and macro distributions use the selected window.</p></>}</UrlTabs></div>;
}
