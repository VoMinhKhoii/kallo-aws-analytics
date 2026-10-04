'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Crown, List, MessageSquare } from 'lucide-react';
import { TimeSeriesChart } from '@/components/console/time-series-chart';
import { secondary } from '@/components/admin/premium/shared';
interface Overview { summary: { accounts: number; signups: number; open_feedback: number; requests: number; errors: number; p95_ms: number | null }; trend: { date: string; requests: number; errors: number }[] }

export default function OverviewPage() {
  const [days, setDays] = useState('30'); const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setError('');
    fetch('/api/admin/overview?days=' + days, { cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }).then(body => { if (active) setData(body); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, refresh]);
  return <div className="mx-auto max-w-6xl py-8">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs uppercase tracking-widest text-[var(--console-muted)]">Kallo administration</p><h1 className="text-3xl font-semibold tracking-tight">The pulse of Kallo.</h1><p className="mt-2 text-sm text-[var(--console-muted)]">Live accounts, meal analysis, and the work that needs your attention.</p></div><div className="flex gap-2"><label className="sr-only" htmlFor="overview-range">Date window</label><select id="overview-range" className={secondary} value={days} onChange={e => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className={secondary} disabled={loading} onClick={() => setRefresh(v => v + 1)}>Refresh</button></div></div>
    {error && <p role="alert" className="mb-5 text-sm text-[var(--console-brick)]">{error}</p>}
    {!data && loading && <div aria-label="Loading overview" className="h-48 animate-pulse bg-[var(--console-panel)]" />}
    {data && <><dl className="grid grid-cols-2 gap-6 border-y border-[var(--console-rule)] py-7 md:grid-cols-4">{[['Registered accounts', data.summary.accounts], ['New signups', data.summary.signups], ['Meal analysis requests', data.summary.requests], ['Open feedback', data.summary.open_feedback]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--console-muted)]">{label}</dt><dd className="mt-3 font-mono text-3xl tabular-nums">{Number(value).toLocaleString()}</dd></div>)}</dl>
    <section className="py-8"><div className="mb-6 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight">Meal analysis</h2><p className="text-xs text-[var(--console-muted)]">{data.summary.errors} errors · P95 {data.summary.p95_ms == null ? 'no timing samples' : (data.summary.p95_ms / 1000).toFixed(1) + 's'} · UTC days</p></div><TimeSeriesChart data={data.trend} series={[{ key: 'requests', label: 'Requests', color: 'var(--console-green)' }, { key: 'errors', label: 'Errors', color: 'var(--console-brick)' }]} ariaLabel="Meal analysis requests and errors over time" /><p className="mt-3 text-xs text-[var(--console-muted)]">Original production requests. Replays are excluded. P95 covers requests with a recorded duration in this window.</p></section></>}
    <section className="border-t border-[var(--console-rule)] pt-7"><h2 className="mb-3 text-xl font-semibold tracking-tight">Your workspace</h2>{[{ href: '/premium', icon: Crown, title: 'Premium', description: 'Manage welcome offers and complimentary access.' }, { href: '/requests', icon: List, title: 'Requests', description: 'Inspect recent meal analyses and their stages.' }, { href: '/feedback', icon: MessageSquare, title: 'Feedback', description: 'Review and triage reports from Kallo users.' }].map(item => <Link href={item.href} key={item.href} className="group flex items-center gap-4 border-b border-[var(--console-rule)] py-5 hover:bg-[var(--console-panel)]"><item.icon className="size-5 text-[var(--console-muted)]" /><div className="flex-1"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-sm text-[var(--console-muted)]">{item.description}</p></div><ArrowUpRight className="size-4 text-[var(--console-muted)] group-hover:text-[var(--console-ink)]" /></Link>)}</section>
  </div>;
}
