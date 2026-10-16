'use client';
import { int, ms, pct, delta } from '@/lib/ai-usage/format';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { MetricSection } from '@/components/shared/metric-section';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { useOverview } from './use-overview';
export function Overview({win,setWin}:{win:string;setWin:(v:string)=>void}) {
  const {data,error,loading,refresh}=useOverview(win);
  if(loading&&!data)return <PageSkeleton title="Overview" charts={2} cells={6} rows/>;
  const labels={meals:'Meals analysed',errorRate:'Error rate',p95MealLatencyMs:'p95 meal latency',dau:'DAU',newSignups:'New signups',openFeedback:'Open feedback'};
  const items=data?Object.entries(labels).map(([key,label])=>{
    const k=key as keyof typeof data.kpis,metric=data.kpis[k],change=delta(metric.comparisonValue,metric.previousValue,k==='errorRate');
    const good=change&&(k==='errorRate'||k==='p95MealLatencyMs'||k==='openFeedback'?!change.up:change.up);
    return {label,value:metric.value==null?'—':k==='errorRate'?pct(metric.value):k==='p95MealLatencyMs'?ms(metric.value):int(metric.value),sub:k==='dau'?'Last full UTC day':k==='openFeedback'?'Current snapshot':k==='errorRate'?(win === '24h' ? 'Rolling last 24 hours' : win === '30d' ? 'last 7 d' : 'Selected 7 d'):undefined,title:k==='p95MealLatencyMs'?data.coverage.p95Source:undefined,delta:change?<span title={win === '24h' ? "vs preceding 24 hours" : "vs prior window of complete days"} className={`rounded border px-1.5 py-0.5 text-[10px] ${good?'border-[var(--console-green)]/30 text-[var(--console-green)]':'border-[var(--console-brick)]/30 text-[var(--console-brick)]'}`}>{change.text}</span>:undefined};
  }):[];
  return <div className="mx-auto grid max-w-[1320px] gap-3 py-4"><PageHeader title="Overview" window={win} onWindow={setWin} refreshing={loading} onRefresh={refresh}/>{error&&<MetricSection title="Overview unavailable" error={error} retry={refresh}/>} {data&&<>
    <KpiStrip items={items}/>{!data.kpis.meals.value&&<p className="text-sm text-muted-foreground">No meals were analysed in this window.</p>}
    <LazySeriesChart windowLabel={win} hourly={win === '24h'} partialLast={false} seriesSubs={{errors:win==='30d'?'last 7 d':win}} bars title={win === '24h' ? "Meals per hour" : "Meals per day"} rows={data.mealsDaily} series={[{key:'analysed',label:'Analysed',color:'var(--console-green)'},{key:'errors',label:'Errors',color:'var(--console-brick)'}]}/>
    <LazySeriesChart windowLabel={win} seriesSubs={{dau:"today so far",wau:"through today"}} step integer title="Active users" rows={data.activeUsersDaily} series={[{key:'dau',label:'DAU',color:'var(--console-blue)'},{key:'wau',label:'WAU',color:'var(--console-green)'}]}/>
    <p className="text-xs text-muted-foreground">DAU counts distinct users per UTC day. WAU covers that day and the preceding six days. Error history is retained for seven days; rejected non-meal input is not counted as an error.{win === '24h' ? "Changes compare the preceding 24 hours; DAU/WAU retain UTC daily definitions." : "Changes compare complete days only."}</p>
    <MetricSection title="Needs attention">{[{href:'/traces?status=error&w=24h',label:'Failed meals today',count:data.needsAttention.failedMealsToday},{href:'/feedback',label:'Feedback open > 48 h',count:data.needsAttention.feedbackOpenOver48h},{href:'/premium',label:'Grants ending within 3 days',count:data.needsAttention.grantsEndingWithin3Days}].map(i=><Link key={i.href} href={i.href} className="flex items-center justify-between gap-3 border-t border-border py-4 text-sm hover:bg-secondary"><span>{i.label}</span><span className="tabular">{int(i.count)} <span className="ml-3 text-muted-foreground">→</span></span></Link>)}</MetricSection>
  </>}</div>;
}
