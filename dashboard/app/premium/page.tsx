'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSessionRole } from '@/lib/use-auth';
import { OfferEditor } from '@/components/admin/premium/offer-editor';
import { GiveEditor } from '@/components/admin/premium/give-editor';
import { AccountSearch } from '@/components/admin/premium/account-search';
import { ActivityList } from '@/components/admin/premium/activity-list';
import { api, secondary, date, type PremiumData } from '@/components/admin/premium/shared';

export default function PremiumPage() {
  const auth = useSessionRole();
  const [tab, setTab] = useState('Overview');
  const [data, setData] = useState<PremiumData | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api<PremiumData>()); } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (auth.role === 'founder') void load(); else if (!auth.loading) setLoading(false); }, [auth.role, auth.loading, load]);
  function onSaved() { setSaved(true); void load(); }
  const title = 'text-xl font-semibold tracking-tight';
  return <div className="mx-auto max-w-6xl py-8">
    <div className="mb-7 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-widest text-[var(--console-muted)]">Kallo administration</p><h1 className="text-3xl font-semibold tracking-tight">Premium</h1><p className="mt-2 text-sm text-[var(--console-muted)]">Welcome offers, free access, and an audit trail for every change.</p></div><button className={secondary} disabled={loading} onClick={() => void load()}>Refresh</button></div>
    {auth.role !== 'founder' && !auth.loading ? <p className="text-sm">Premium management requires founder access. Sign in with your founder account.</p> : <>
      <nav aria-label="Premium sections" className="mb-8 flex gap-6 overflow-x-auto border-b border-[var(--console-rule)]">{['Overview', 'Give / End', 'Accounts', 'Activity'].map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setSaved(false); }} className={'shrink-0 border-b-2 py-3 text-sm font-medium ' + (tab === t ? 'border-[var(--console-ink)]' : 'border-transparent text-[var(--console-muted)] hover:text-[var(--console-ink)]')}>{t}</button>)}</nav>
      {saved && <p role="status" className="mb-5 text-sm text-[var(--console-green)]">Change saved and recorded in Activity.</p>}
      {error && <div role="alert" className="mb-6 rounded-md border border-[var(--console-rule)] p-5"><p className="text-sm text-[var(--console-brick)]">{error}</p><button className={secondary + ' mt-3'} onClick={() => void load()}>Try again</button></div>}
      {loading && !data && <div aria-label="Loading Premium data" className="h-36 animate-pulse rounded-md bg-[var(--console-panel)]" />}
      {data && tab === 'Overview' && <><dl className="mb-10 grid grid-cols-2 gap-6 border-b border-[var(--console-rule)] pb-7 md:grid-cols-4">{[['On free Premium', data.overview.onFreePremium], ['Ending within 3 days', data.overview.endingSoon], ['Paying subscribers', data.overview.paying], ['Upgraded during free access', data.overview.upgradedDuringFree]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--console-muted)]">{label}</dt><dd className="mt-2 font-mono text-3xl tabular-nums">{value}</dd></div>)}</dl><div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]"><section><h2 className={title + ' mb-5'}>Welcome offer</h2><OfferEditor key={JSON.stringify(data.offer)} offer={data.offer} onSaved={onSaved} /></section><section className="lg:border-l lg:border-[var(--console-rule)] lg:pl-8"><h2 className={title + ' mb-5'}>Ending soonest</h2>{data.ending.length ? data.ending.map(a => <div key={a.id} className="border-b border-[var(--console-rule)] py-3"><p className="break-all text-sm">{a.email}</p><p className="mt-1 text-xs text-[var(--console-muted)]">{date(a.freeUntil)}</p></div>) : <p className="text-sm text-[var(--console-muted)]">No free Premium grants are nearing their end.</p>}</section></div></>}
      {data && tab === 'Give / End' && <div className="max-w-2xl"><GiveEditor onSaved={onSaved} /></div>}
      {tab === 'Accounts' && <div className="max-w-3xl"><AccountSearch selected={[]} onSelect={() => {}} detail /></div>}
      {data && tab === 'Activity' && <ActivityList rows={data.activity} onSaved={onSaved} />}
    </>}
  </div>;
}
