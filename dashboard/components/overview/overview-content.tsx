'use client';
import { int, ms, pct, delta } from '@/lib/ai-usage/format';
import Link from 'next/link';
import { useState } from 'react';
import { CaretRight, ChatCircleText, Crown, WarningCircle } from '@phosphor-icons/react/ssr';
import { LatestMeals } from './latest-meals';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { Change } from '@/components/shared/kpi-cell';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { useOverview } from './use-overview';
export function Overview({win,setWin}:{win:string;setWin:(v:string)=>void}) {
  const {data,error,loading,refresh:reloadOverview}=useOverview(win);const [reload,setReload]=useState(0);const refresh=()=>{reloadOverview();setReload(n=>n+1);};
  if(loading&&!data)return <PageSkeleton title="Overview" charts={2} cells={6} rows/>;
  const labels={meals:'Meals analysed',errorRate:'Error rate',p95MealLatencyMs:'p95 meal latency',dau:'DAU',newSignups:'New signups',openFeedback:'Open feedback'};
  const vs=win==='24h'?'vs prior 24 h':'vs prior period';
  const items=data?Object.entries(labels).map(([key,label])=>{
    const k=key as keyof typeof data.kpis,metric=data.kpis[k],change=delta(metric.comparisonValue,metric.previousValue,k==='errorRate');
    const goodUp=!(k==='errorRate'||k==='p95MealLatencyMs'||k==='openFeedback');
    return {label,value:metric.value==null?'—':k==='errorRate'?pct(metric.value):k==='p95MealLatencyMs'?ms(metric.value):int(metric.value),sub:k==='dau'?'last full UTC day':k==='openFeedback'?'now':k==='errorRate'?(win==='24h'?'last 24 h':'last 7 d'):undefined,title:k==='p95MealLatencyMs'?data.coverage.p95Source:undefined,delta:<Change change={change} goodUp={goodUp} vs={vs} title={win === '24h' ? "vs preceding 24 hours" : "vs prior window of complete days"}/>};
  }):[];
  // The open work is listed in Needs attention, so the line under the title only sums up the window.
  const summary=data?(()=>{const meals=data.kpis.meals.value,p95=data.kpis.p95MealLatencyMs.value;
    return `${meals==null?'No meal count':`${int(meals)} meal${meals===1?'':'s'} analysed`} ${win==='24h'?'in the last 24 hours':`in the last ${data.days} days`}${p95==null?'':`, p95 ${ms(p95)}`}`;})():undefined;
  const attention=data?[
    {href:'/traces?status=error&w=24h',label:'Failed meals today',sub:'Non-meal input is not counted',count:data.needsAttention.failedMealsToday,icon:WarningCircle,tone:'var(--console-brick)'},
    {href:'/feedback',label:'Feedback open over 48 h',sub:'Reports waiting for triage',count:data.needsAttention.feedbackOpenOver48h,icon:ChatCircleText,tone:'var(--console-amber)'},
    {href:'/premium',label:'Free Premium ending in 3 days',sub:'Grants about to lapse',count:data.needsAttention.grantsEndingWithin3Days,icon:Crown,tone:'var(--console-data)'},
  ]:[];
  return <div className="mx-auto grid max-w-[1320px] gap-4 py-6"><PageHeader title="Overview" description={summary} window={win} onWindow={setWin} refreshing={loading} onRefresh={refresh}/>{error&&<MetricSection title="Overview unavailable" error={error} retry={refresh}/>} {data&&<>
    <KpiStrip items={items}/>{!data.kpis.meals.value&&<p className="text-sm text-muted-foreground">No meals were analysed in this window.</p>}
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2"><LazySeriesChart compact height={260} windowLabel={win} hourly={win === '24h'} seriesSubs={{errors:win==='30d'?'last 7 d':win}} bars title={win === '24h' ? "Meals per hour" : "Meals per day"} rows={data.mealsDaily} series={[{key:'analysed',label:'Analysed',color:'var(--console-data)'},{key:'errors',label:'Errors',color:'var(--console-brick)'}]}/></div>
      <MetricSection card title="Needs attention" description="Open work, counted now">
        <div className="-mx-4 -mb-4 flex flex-1 flex-col divide-y divide-border border-t border-border">{attention.map(i=><Link key={i.href} href={i.href} className="group flex flex-1 items-center gap-4 px-4 py-4 transition-colors last:rounded-b-xl hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-blue)]">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={i.count?{color:i.tone,background:`color-mix(in oklab, ${i.tone} 12%, transparent)`}:{color:'var(--console-quiet)',background:'var(--console-surface)'}}><i.icon weight="fill" className="size-4"/></span>
          <span className="grid min-w-0 flex-1"><span className="truncate text-sm">{i.label}</span><span className="truncate text-xs text-muted-foreground">{i.sub}</span></span>
          <span className={`tabular text-xl leading-none font-medium ${i.count?'':'text-muted-foreground'}`}>{int(i.count)}</span>
          <CaretRight aria-hidden="true" className="size-4 shrink-0 text-[var(--console-quiet)] transition-colors group-hover:text-foreground"/>
        </Link>)}</div>
      </MetricSection>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2"><LatestMeals version={reload}/></div>
      <LazySeriesChart compact height={236} windowLabel={win} seriesSubs={{dau:"today so far",wau:"through today"}} step integer title="Active users" subtitle={win === '24h' ? "last 7 days, UTC days" : "UTC days"} rows={data.activeUsersDaily} series={[{key:'dau',label:'DAU',color:'var(--console-data)'},{key:'wau',label:'WAU',color:'var(--console-quiet)'}]}/>
    </div>
    <p className="max-w-[80ch] text-xs leading-5 text-muted-foreground">DAU counts distinct users per UTC day; WAU covers that day and the six before it. Error history is kept for seven days, and rejected non-meal input is not counted as an error. {win === '24h' ? "Changes compare the preceding 24 hours." : Object.values(data.kpis).some(k=>k.previousValue!=null) ? "Changes compare complete days only." : "No change is shown yet: the prior window has too few complete days of data."}</p>
  </>}</div>;
}
