'use client';
import { int, ms, pct, delta } from '@/lib/ai-usage/format';
import Link from 'next/link';
import { useState } from 'react';
import { CaretRight } from '@phosphor-icons/react/ssr';
import { LatestMeals } from './latest-meals';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { Change } from '@/components/shared/kpi-cell';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { cn } from '@/lib/utils';
import { MetricTabs, type MetricTab } from '@/components/shared/metric-tabs';
import { useOverview } from './use-overview';

type Tab = 'meals' | 'errors' | 'users' | 'latency' | 'signups';

export function Overview({win,setWin}:{win:string;setWin:(v:string)=>void}) {
  const {data,error,loading,refresh:reloadOverview}=useOverview(win);
  const [reload,setReload]=useState(0);
  const [tab,setTab]=useState<Tab>('meals');
  const refresh=()=>{reloadOverview();setReload(n=>n+1);};
  if(loading&&!data)return <PageSkeleton title="Overview" charts={1} cells={3} rows/>;

  const hourly=win==='24h';
  const vs=hourly?'vs prior 24 h':'vs prior period';
  const vsTitle=hourly?'vs preceding 24 hours':'vs prior window of complete days';
  const k=data?.kpis;
  const change=(m:{comparisonValue:number|null;previousValue:number|null},goodUp:boolean,points=false)=><Change change={delta(m.comparisonValue,m.previousValue,points)} goodUp={goodUp} vs={vs} title={vsTitle}/>;

  const tabs:MetricTab[]=k?[
    {key:'meals',label:'Meals analysed',value:k.meals.value==null?'—':int(k.meals.value),change:change(k.meals,true)},
    {key:'errors',label:'Error rate',value:k.errorRate.value==null?'—':pct(k.errorRate.value),change:change(k.errorRate,false,true),title:hourly?undefined:'Last 7 days: error history is kept for seven days'},
    {key:'users',label:'Daily active users',value:k.dau.value==null?'—':int(k.dau.value),change:change(k.dau,true),title:'Last full UTC day. The chart also draws weekly active users.'},
    {key:'latency',label:'p95 meal latency',value:k.p95MealLatencyMs.value==null?'—':ms(k.p95MealLatencyMs.value),change:change(k.p95MealLatencyMs,false),title:data!.coverage.p95Source},
    {key:'signups',label:'New signups',value:k.newSignups.value==null?'—':int(k.newSignups.value),change:change(k.newSignups,true)},
  ]:[];
  const attention=data?[
    {href:'/traces?status=error&w=24h',label:'Failed meals today',count:data.needsAttention.failedMealsToday,tone:'var(--console-brick)'},
    {href:'/feedback',label:'Feedback open over 48 h',count:data.needsAttention.feedbackOpenOver48h,tone:'var(--console-amber)'},
    {href:'/premium',label:'Premium ending in 3 d',count:data.needsAttention.grantsEndingWithin3Days,tone:'var(--console-accent)'},
    {href:'/feedback',label:'Open feedback',count:k?.openFeedback.value??0,tone:'var(--console-data)'},
  ]:[];
  const errorRows=data?data.mealsDaily.map(r=>({date:r.date,rate:r.errors==null||!r.analysed?null:r.errors/r.analysed})):[];

  const attentionList=<section aria-label="Needs attention">
    <h2 className="text-base font-medium">Needs attention</h2>
    <ul className="mt-2">
      {attention.map(i=><li key={i.label}><Link href={i.href} className="group flex items-center gap-3 border-b border-border py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-accent)]">
        <span className="size-1.5 shrink-0 rounded-full" style={{background:i.count?i.tone:'var(--console-quiet)'}}/>
        <span className={cn('min-w-0 flex-1',i.count?'':'text-muted-foreground')}>{i.label}</span>
        <span className={cn('tabular',i.count?'font-medium':'text-[var(--console-faint)]')}>{int(i.count)}</span>
        <CaretRight aria-hidden="true" className="size-3 shrink-0 text-[var(--console-quiet)] transition-colors group-hover:text-foreground"/>
      </Link></li>)}
    </ul>
  </section>;
  const chart={bare:true,compact:true,height:340,windowLabel:win} as const;
  return <div className="grid gap-8">
    <PageHeader title="Overview" window={win} onWindow={setWin} refreshing={loading} onRefresh={refresh}/>
    {error&&<MetricSection title="Overview unavailable" error={error} retry={refresh}/>}
    {data&&k&&<>
      <MetricTabs tabs={tabs} value={tab} onChange={v=>setTab(v as Tab)} aside={attentionList}>
        {tab==='meals'&&<LazySeriesChart {...chart} title={hourly?'Meals per hour':'Meals per day'} hourly={hourly} integer rows={data.mealsDaily} series={[{key:'analysed',label:'Analysed',color:'var(--console-data)'},{key:'errors',label:'Errors',color:'var(--console-brick)'}]}/>}
        {tab==='errors'&&<LazySeriesChart {...chart} title="Error rate" hourly={hourly} format="percent" rows={errorRows} series={[{key:'rate',label:'Error rate',color:'var(--console-brick)'}]}/>}
        {tab==='users'&&<LazySeriesChart {...chart} title="Active users" step integer rows={data.activeUsersDaily} series={[{key:'dau',label:'DAU',color:'var(--console-data)'},{key:'wau',label:'WAU',color:'var(--console-data-2)'}]}/>}
        {tab==='latency'&&<LazySeriesChart {...chart} title="p95 meal latency" format="duration" rows={data.dailyExtras} series={[{key:'p95',label:'p95 meal latency',color:'var(--console-data)'}]}/>}
        {tab==='signups'&&<LazySeriesChart {...chart} title="New signups" integer rows={data.dailyExtras} series={[{key:'signups',label:'New signups',color:'var(--console-data)'}]}/>}
      </MetricTabs>
      <LatestMeals version={reload}/>
      <p className="max-w-[90ch] text-xs leading-5 text-[var(--console-faint)]">DAU counts distinct users per UTC day; WAU covers that day and the six before it. Error history is kept for seven days, and rejected non-meal input is not counted as an error. {hourly ? 'Changes compare the preceding 24 hours.' : Object.values(data.kpis).some(m=>m.previousValue!=null) ? 'Changes compare complete days only.' : 'No change is shown yet: the prior window has too few complete days of data.'}</p>
    </>}
  </div>;
}
