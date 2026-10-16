"use client";
import Link from 'next/link';
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
  const {bundle, mappings, demand, gaps, ranks, reverse, macros, matches, flags} = useIngredients(win);
  const err = (name: keyof typeof bundle.errors) => bundle.errors[name] ?? bundle.error;
  const decisions = mappings.reduce((n,r) => n + r.decision_count, 0); const accepted = mappings.reduce((n,r) => n + r.accepted_count,0);
  const ranked = ranks.reduce((n,r) => n + r.count,0); const first = ranks.filter(r => r.selected_rank === 1).reduce((n,r) => n + r.count,0);
  const unmatched = matches.reduce((n,r) => n + r.unmatched_count,0);
  const matched = matches.reduce((n,r)=>n+r.matched_count,0);
  const rate = (a: number, b: number) => pct(b ? a / b : null);
  if (bundle.loading) return <PageSkeleton title="Ingredients" cells={4} charts={1} rows />;
  return <div className="mx-auto grid max-w-[1320px] gap-3 py-4"><PageHeader title="Ingredients" window={win} onWindow={setWin} refreshing={bundle.refreshing} onRefresh={bundle.refresh} /><UrlTabs value={tab} onChange={setTab} items={[{value:'matching',label:'Matching'},{value:'catalog',label:'Catalog'}]}>{tab === 'matching' ? <><KpiStrip items={[{label:'Decisions',value:int(decisions),sub:'Top 50 queries per day',error:err('ingredient_mappings')},{label:'Acceptance',value:rate(accepted,decisions),sub:'Top 50 queries per day',error:err('ingredient_mappings')},{label:'First choice',value:rate(first,ranked),error:err('ingredient_rank_distribution')},{label:'Match rate',value:rate(matched,matched+unmatched),error:err('match_rate')}]} />{err('match_rate') ? <MetricSection title="Match rate" error={err('match_rate')} retry={bundle.refresh} /> : <LazySeriesChart windowLabel={win} hourly={win === '24h'} partialLast={false} bars stacked title="Ingredient matches" rows={matches} series={[{key:'matched_count',label:'Matched',color:'var(--console-green)'},{key:'unmatched_count',label:'Unmatched',color:'var(--console-brick)'}]} />}<MetricSection title="Demand" error={err('ingredient_demand') ?? err('ingredient_mappings')} retry={bundle.refresh} empty={!demand.length}><DemandList rows={demand} mappings={mappings} /></MetricSection><MetricSection title="Gaps" error={err('ingredient_gaps')} retry={bundle.refresh} empty={!gaps.length}><div className="divide-y divide-border">{gaps.slice(0,20).map((r,i)=><div key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-xs"><span className="min-w-32 flex-1 break-words">{r.ingredient_query}</span><span className="text-[var(--console-amber)]">{r.verdict} · {r.reject_bucket}</span><span className="tabular">{int(r.count)}</span><span className="text-muted-foreground">Last seen {r.last_seen?new Date(r.last_seen).toISOString().replace('T',' ').slice(0,16)+' UTC':r.date??'not recorded'}</span><Link className="text-[var(--console-blue)] hover:underline" href={r.last_trace_id?`/traces/${encodeURIComponent(r.last_trace_id)}?w=${win}`:`/traces?w=${win}&q=${encodeURIComponent(r.ingredient_query)}`}>{r.last_trace_id?'Trace →':'Find traces →'}</Link></div>)}</div></MetricSection><MetricSection title="Accepted rank by pool size" error={err('ingredient_rank_distribution')} retry={bundle.refresh} empty={!ranks.length}><BarList items={ranks.map(r => ({label:`Pool ${int(r.pool_size)} · rank ${int(r.selected_rank)}`,value:r.count,detail:`${pct(r.share)} within pool`,tone:r.selected_rank === 1 ? 'green' : 'blue'}))} /></MetricSection></> : <><CatalogLists rows={reverse} flags={flags} errors={[err('corpus_reverse_lookup'),err('implausible_foods')]} retry={bundle.refresh} /><MetricSection title="Meal macro distribution" error={err('macro_distributions')} retry={bundle.refresh} empty={!macros.length}><Histogram rows={macros} /></MetricSection><p className="text-xs text-muted-foreground">Catalog checks are a current snapshot; corpus coverage and macro distributions use the selected window.</p></>}</UrlTabs></div>;
}
