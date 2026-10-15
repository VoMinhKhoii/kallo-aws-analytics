'use client';
import { useUrlState } from '@/lib/use-url-state';
import { useRefocus } from '@/lib/use-refocus';
import { PageHeader } from '@/components/shared/page-header';
import { UrlTabs } from '@/components/shared/url-tabs';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { useCallback, useEffect, useState } from 'react';
import { useSessionRole } from '@/lib/use-auth';
import { OfferEditor } from '@/components/admin/premium/offer-editor';
import { GiveEditor } from '@/components/admin/premium/give-editor';
import { AccountSearch } from '@/components/admin/premium/account-search';
import { ActivityList } from '@/components/admin/premium/activity-list';
import { api, secondary, date, type PremiumData } from '@/components/admin/premium/shared';

export default function PremiumPage() {
  const auth = useSessionRole();
  const [tab, setTab] = useUrlState('tab', 'overview', ['overview','give','accounts','activity']);
  const [data, setData] = useState<PremiumData | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api<PremiumData>()); } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (auth.role === 'founder') void load(); else if (!auth.loading) setLoading(false); }, [auth.role, auth.loading, load]);
  useRefocus(() => { if (auth.role === 'founder') void load(); });
  function onSaved() { setSaved(true); void load(); }
  const title = 'text-xl font-semibold tracking-tight';
  return <div className="mx-auto max-w-[1320px] space-y-4 py-4">
    <PageHeader title="Premium" refreshing={loading} onRefresh={auth.role === 'founder' ? () => void load() : undefined} />
    {auth.role !== 'founder' && !auth.loading ? <p className="text-sm">Premium management requires founder access. Sign in with your founder account.</p> : <>
      <UrlTabs value={tab} onChange={v => { setTab(v); setSaved(false); }} items={[{value:'overview',label:'Overview'},{value:'give',label:'Give / End'},{value:'accounts',label:'Accounts'},{value:'activity',label:'Activity'}]}>
      {saved && <p role="status" className="mb-5 text-sm text-[var(--console-green)]">Change saved and recorded in Activity.</p>}
      {error && <div role="alert" className="mb-6 rounded-md border border-[var(--console-rule)] p-5"><p className="text-sm text-[var(--console-brick)]">{error}</p><button className={secondary + ' mt-3'} onClick={() => void load()}>Try again</button></div>}
      {loading && !data && <PageSkeleton title="Premium" cells={4} charts={0} rows />}
      {data && tab === 'overview' && <><KpiStrip items={[{label:'On free Premium',value:String(data.overview.onFreePremium)},{label:'Ending within 3 days',value:String(data.overview.endingSoon)},{label:'Paying subscribers',value:String(data.overview.paying)},{label:'Upgraded during free access',value:String(data.overview.upgradedDuringFree)}]} /><div className="grid gap-8 pt-6"><section><h2 className={title + ' mb-5'}>Welcome offer</h2><OfferEditor key={JSON.stringify(data.offer)} offer={data.offer} onSaved={onSaved} /></section><section className="border-t border-border pt-6"><h2 className={title + ' mb-5'}>Ending soonest</h2>{data.ending.length ? data.ending.map(a => <div key={a.id} className="border-b border-[var(--console-rule)] py-3"><p className="break-all text-sm">{a.email}</p><p className="mt-1 text-xs text-[var(--console-muted)]">{date(a.freeUntil)}</p></div>) : <p className="text-sm text-[var(--console-muted)]">No free Premium grants are nearing their end.</p>}</section></div></>}
      {data && tab === 'give' && <div className="max-w-2xl"><GiveEditor onSaved={onSaved} /></div>}
      {tab === 'accounts' && <div className="max-w-3xl"><AccountSearch selected={[]} onSelect={() => {}} detail /></div>}
      {data && tab === 'activity' && <ActivityList rows={data.activity} onSaved={onSaved} />}
      </UrlTabs>
    </>}
  </div>;
}
