'use client';
import Link from 'next/link';
import { int } from '@/lib/ai-usage/format';
import { useUrlState } from '@/lib/use-url-state';
import { useRefocus } from '@/lib/use-refocus';
import { PageHeader } from '@/components/shared/page-header';
import { UrlTabs } from '@/components/shared/url-tabs';
import { KpiStrip } from '@/components/shared/kpi-strip';
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
  return <div className="mx-auto max-w-[1320px] space-y-4 py-6">
    <PageHeader title="Premium" refreshing={loading} onRefresh={() => { if(auth.role === 'founder')void load(); }} />
    {auth.error ? <p role="alert" className="text-sm">Session unavailable: {auth.error}. Use Refresh to retry.</p> : auth.role !== 'founder' && !auth.loading ? <p className="text-sm">Premium management requires founder access. Sign in with your founder account.</p> : <>
      <UrlTabs value={tab} onChange={v => { setTab(v); setSaved(false); }} items={[{value:'overview',label:'Overview'},{value:'give',label:'Give / End'},{value:'accounts',label:'Accounts'},{value:'activity',label:'Activity'}]}>
      {saved && <p role="status" className="mb-6 text-sm text-foreground mark-good">Change saved and recorded in Activity.</p>}
      {error && <div role="alert" className="mb-6 rounded-md border border-[var(--console-rule)] p-6"><p className="text-sm text-foreground mark-bad">{error}</p><button className={secondary + ' mt-4'} onClick={() => void load()}>Try again</button></div>}
      {loading && !data && <PageSkeleton title="Premium" cells={4} charts={0} rows />}
      {data && tab === 'overview' && <><KpiStrip items={[{label:'On free Premium',value:int(data.overview.onFreePremium)},{label:'Ending within 3 days',value:int(data.overview.endingSoon)},{label:'Paying subscribers',value:int(data.overview.paying)},{label:'Upgraded during free access',value:int(data.overview.upgradedDuringFree)}]} /><div className="grid items-start gap-4 lg:grid-cols-2">
        <MetricSection card title="Welcome offer" description="Free Premium for new signups"><OfferEditor key={JSON.stringify(data.offer)} offer={data.offer} onSaved={onSaved} /></MetricSection>
        <MetricSection card title="Ending soonest" description={`${int(data.ending.length)} of ${int(data.overview.onFreePremium)} on free Premium`} action={<button type="button" className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={()=>setTab('accounts')}>Accounts<CaretRight aria-hidden="true" className="size-3.5" /></button>} empty={!data.ending.length}>
          <div className="-mx-4 -mb-4 divide-y divide-border border-t border-border">{data.ending.map(a => { const left = Math.ceil((Date.parse(a.freeUntil)-Date.now())/86400000); return <Link key={a.id} href={`/premium?tab=accounts&account=${encodeURIComponent(a.id)}`} className="group flex items-center gap-4 px-4 py-3 transition-colors last:rounded-b-xl hover:bg-secondary">
            <span className="grid min-w-0 flex-1"><span className="truncate text-sm">{a.email}</span><span className="text-xs text-muted-foreground">{date(a.freeUntil)}</span></span>
            <span className="tabular shrink-0 text-sm text-muted-foreground">{left > 0 ? `in ${left} d` : 'Ended'}</span>
            <CaretRight aria-hidden="true" className="size-4 shrink-0 text-[var(--console-quiet)] transition-colors group-hover:text-foreground" />
          </Link>; })}</div>
        </MetricSection>
      </div></>}
      {data && tab === 'give' && <div className="max-w-2xl"><GiveEditor onSaved={onSaved} /></div>}
      {tab === 'accounts' && <div className="max-w-3xl"><AccountSearch selected={[]} onSelect={() => {}} detail initialAccount={accountId} onChanged={onSaved} /></div>}
      {data && tab === 'activity' && <ActivityTab rows={data.activity} onSaved={onSaved} />}
      </UrlTabs>
    </>}
  </div>;
}
