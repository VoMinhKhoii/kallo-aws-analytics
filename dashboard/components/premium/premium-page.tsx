'use client';
import Link from 'next/link';
import { int } from '@/lib/ai-usage/format';
import { useUrlState } from '@/lib/use-url-state';
import { useRefocus } from '@/lib/use-refocus';
import { PageHeader } from '@/components/shared/page-header';
import { UrlTabs } from '@/components/shared/url-tabs';
import { MetricTabs } from '@/components/shared/metric-tabs';
import { LazySeriesChart } from '@/components/charts/lazy-series-chart';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { useCallback, useEffect, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react/ssr';
import { MetricSection } from '@/components/shared/metric-section';
import { useSessionRole } from '@/lib/use-auth';
import { OfferEditor } from '@/components/admin/premium/offer-editor';
import { GiveEditor } from '@/components/admin/premium/give-editor';
import { AccountSearch } from '@/components/admin/premium/account-search';
import { ActivityTab } from '@/components/admin/premium/activity-tab';
import { api, secondary, date, type PremiumData } from '@/components/admin/premium/shared';

export default function PremiumPage() {
  const [metric, setMetric] = useState('free');
  const auth = useSessionRole();
  const [tab, setTab] = useUrlState('tab', 'overview', ['overview','give','accounts','activity']);
  const [accountId]=useUrlState('account','');
  const [data, setData] = useState<PremiumData | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api<PremiumData>()); } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (auth.role === 'founder') void load(); else if (!auth.loading) setLoading(false); }, [auth.role, auth.loading, load]);
  useRefocus(() => { if (auth.role === 'founder') void load(); });
  function onSaved() { setSaved(true); void load(); }
  return <div className="space-y-6">
    <PageHeader title="Premium" refreshing={loading} onRefresh={() => { if(auth.role === 'founder')void load(); }} />
    {auth.error ? <p role="alert" className="text-sm">Session unavailable: {auth.error}. Use Refresh to retry.</p> : auth.role !== 'founder' && !auth.loading ? <p className="text-sm">Premium management requires founder access. Sign in with your founder account.</p> : <>
      <UrlTabs value={tab} onChange={v => { setTab(v); setSaved(false); }} items={[{value:'overview',label:'Overview'},{value:'give',label:'Give / End'},{value:'accounts',label:'Accounts'},{value:'activity',label:'Activity'}]}>
      {saved && <p role="status" className="mb-6 text-sm text-foreground mark-good">Change saved and recorded in Activity.</p>}
      {error && <div role="alert" className="mb-6 border-t border-border pt-5"><p className="text-sm text-foreground mark-bad">{error}</p><button className={secondary + ' mt-4'} onClick={() => void load()}>Try again</button></div>}
      {loading && !data && <PageSkeleton title="Premium" cells={4} charts={0} rows />}
      {data && tab === 'overview' && <div className="grid gap-10">
        <MetricTabs value={metric} onChange={setMetric} tabs={[{key:'free',label:'On free Premium',value:int(data.overview.onFreePremium)},{key:'ending',label:'Ending within 3 days',value:int(data.overview.endingSoon)},{key:'paying',label:'Paying subscribers',value:int(data.overview.paying)},{key:'upgraded',label:'Upgraded while free',value:int(data.overview.upgradedDuringFree),title:'Paying accounts whose first paid grant started during free Premium'}]}
          aside={<MetricSection title="Ending soonest" action={<button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={()=>setTab('accounts')}>Accounts<CaretRight aria-hidden="true" className="size-3" /></button>} empty={!data.ending.length}>
            <div className="divide-y divide-border border-y border-border">{data.ending.map(a => { const left = Math.ceil((Date.parse(a.freeUntil)-Date.now())/86400000); return <Link key={a.id} href={`/premium?tab=accounts&account=${encodeURIComponent(a.id)}`} className="group flex items-center gap-4 py-3 transition-colors hover:bg-secondary">
              <span className="grid min-w-0 flex-1"><span className="truncate text-sm">{a.email}</span><span className="text-xs text-[var(--console-faint)]">{date(a.freeUntil)}</span></span>
              <span className="tabular shrink-0 text-sm text-muted-foreground">{left > 0 ? `in ${left} d` : 'Ended'}</span>
              <CaretRight aria-hidden="true" className="size-3 shrink-0 text-[var(--console-quiet)] transition-colors group-hover:text-foreground" />
            </Link>; })}</div>
          </MetricSection>}>
          {metric === 'ending'
            ? <LazySeriesChart bare compact height={300} integer partialLast={false} title="Free Premium ending per day" rows={data.endingByDay} series={[{key:'ending',label:'Ending, next 14 days',color:'var(--console-data)'}]} />
            : <LazySeriesChart bare compact height={300} integer title="Per day, last 30 days" rows={data.trend} series={[metric === 'free' ? {key:'freeStarted',label:'Free Premium given',color:'var(--console-data)'} : metric === 'paying' ? {key:'paidStarted',label:'New paying accounts',color:'var(--console-data)'} : {key:'upgraded',label:'Upgraded while free',color:'var(--console-data)'}]} />}
        </MetricTabs>
        <div className="max-w-2xl"><MetricSection title="Welcome offer"><OfferEditor key={JSON.stringify(data.offer)} offer={data.offer} onSaved={onSaved} /></MetricSection></div>
      </div>}
      {data && tab === 'give' && <div className="max-w-2xl"><GiveEditor onSaved={onSaved} /></div>}
      {tab === 'accounts' && <div className="max-w-3xl"><AccountSearch selected={[]} onSelect={() => {}} detail initialAccount={accountId} onChanged={onSaved} /></div>}
      {data && tab === 'activity' && <ActivityTab rows={data.activity} onSaved={onSaved} />}
      </UrlTabs>
    </>}
  </div>;
}
