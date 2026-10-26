'use client';
import { apiFetch } from '@/lib/api-fetch';
import { plural } from '@/lib/traces-ui/graph';
import { int, ms } from '@/lib/ai-usage/format';
import { useUrlState } from '@/lib/use-url-state';
import { useRefocus } from '@/lib/use-refocus';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { FilterChips } from '@/components/shared/filter-chips';
import { useEffect, useState } from 'react';
import { useSessionRole } from '@/lib/use-auth';
import { date, secondary } from './premium/shared';
import { FeedbackDetail } from './feedback-detail';
interface Row { id: string; message: string; status: string; duration_ms?: number; created_at: string; type?: string; platform?: string; has_screenshot?: boolean }
const TYPES = ['all', 'bug', 'ingredient', 'idea'] as const;
const TYPE_LABELS: Record<string, string> = { all: 'All types', bug: 'Bug', ingredient: 'Ingredient request', idea: 'Idea' };
interface Detail { row: { input: string }; stages: { stage: string; status: string; duration_ms: number | null }[]; calls: { model: string; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; attempt: number }[] }

export function Records({ kind }: { kind: 'requests' | 'feedback' }) {
  const auth = useSessionRole();
  const [page, setPage] = useState(1); const [status, setStatus, urlReady] = useUrlState('status', 'all', kind === 'feedback' ? ['all','open','triaged','resolved','wontfix'] : ['all','success','error','pending']);
  const [type, setType] = useUrlState('type', 'all', TYPES);
  // A status or type change from browser history starts from page 1, like a chip click.
  useEffect(() => { setPage(1); }, [status, type]);
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null); const [active, setActive] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => { if (!urlReady) return; if (auth.role !== 'founder') { if (!auth.loading) setLoading(false); return; } let live = true; setLoading(true); setError('');
    apiFetch(`/api/admin/records?kind=${kind}&page=${page}&status=${status}${kind === 'feedback' ? `&type=${type}` : ''}`, { cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }).then(body => { if (live) { setRows(body.rows); setTotal(body.total);
      // The last record on a later page was resolved: step back to the last page that exists.
      if (!body.rows.length && page > 1) setPage(Math.max(1, Math.ceil(body.total / 30))); } }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [kind, page, status, type, refresh, auth.role, auth.loading, urlReady]);
  useRefocus(() => setRefresh(v => v + 1));
  async function inspect(id: string) {
    if (active === id) { setActive(''); setDetail(null); return; }
    setActive(id); setDetail(null); setBusy(id); setError('');
    try { const r = await apiFetch(`/api/admin/records?kind=requests&id=${id}`); const body = await r.json(); if (!r.ok) throw new Error(body.error); setDetail(body); }
    catch(e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function update(id: string, status: string) {
    setBusy(id); setError('');
    try { const r = await apiFetch('/api/admin/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setRefresh(v => v + 1); }
    catch(e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  const feedback = kind === 'feedback';
  return <div className="mx-auto max-w-[1320px] space-y-4 py-4"><PageHeader title={feedback ? 'Feedback' : 'Requests'} refreshing={loading} onRefresh={() => setRefresh(v => v + 1)} /><FilterChips value={status} onChange={v => {setStatus(v); setPage(1); setActive(''); setDetail(null);}} items={(feedback ? ['all','open','triaged','resolved','wontfix'] : ['all','success','error','pending']).map(value => ({value,label:value === 'wontfix' ? "Won't fix" : value.charAt(0).toUpperCase()+value.slice(1)}))} />
    {feedback && <FilterChips value={type} onChange={v => {setType(v as typeof type); setPage(1); setActive('');}} items={TYPES.map(value => ({value, label: TYPE_LABELS[value]}))} />}
    {auth.role !== 'founder' && !auth.loading && <p className="text-sm">Account-level records require founder access.</p>}
    {error && <p role="alert" className="mb-6 text-sm text-foreground mark-bad">{error} <button className="underline" onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}
    {loading && !rows.length && <PageSkeleton title="Feedback" cells={0} charts={0} rows /> }
    {auth.role === 'founder' && <><p className="mb-4 text-xs text-muted-foreground">{plural(total,'record')}{(total>30||page>1)&&` · Page ${int(page)}`}</p><div className="divide-y divide-[var(--console-rule)] border-y border-[var(--console-rule)]">{rows.map(row => <article key={row.id} className="py-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{date(row.created_at)} · {row.type || 'Meal analysis'} {row.platform && '· ' + row.platform}</p><p className="mt-2 max-w-prose whitespace-pre-wrap break-words text-sm">{row.message}</p>{!feedback && <p className="mt-2 text-xs text-muted-foreground">{row.status}{row.duration_ms != null && ' · ' + ms(row.duration_ms)}</p>}</div>{feedback ? <div className="flex shrink-0 items-center gap-2"><button className={secondary} aria-expanded={active === row.id} onClick={() => setActive(a => a === row.id ? '' : row.id)}>{active === row.id ? 'Close' : row.has_screenshot ? 'Details · screenshot' : 'Details'}</button><label className="flex items-center whitespace-nowrap text-xs">Status<select className={secondary + ' ml-2'} aria-label="Update feedback status" value={row.status} disabled={busy === row.id} onChange={e => void update(row.id, e.target.value)}>{['open', 'triaged', 'resolved', 'wontfix'].map(s => <option key={s} value={s}>{s === 'wontfix' ? "Won't fix" : s}</option>)}</select></label></div> : <button className={secondary} disabled={Boolean(busy)} onClick={() => void inspect(row.id)}>{busy === row.id ? 'Loading…' : active === row.id ? 'Close' : 'Inspect'}</button>}</div>
      {feedback && active === row.id && <FeedbackDetail id={row.id} />}
      {!feedback && active === row.id && detail && <section className="mt-6 border-t border-[var(--console-rule)] pt-4"><p className="mb-6 whitespace-pre-wrap break-words text-sm">{detail.row.input}</p><h2 className="mb-2 text-sm font-semibold">Pipeline stages</h2>{detail.stages.length === 0 && <p className="py-2 text-xs text-muted-foreground">No stage records were stored for this request.</p>}{detail.stages.map((s, i) => <div key={i} className="flex justify-between gap-4 py-2 text-sm"><span>{s.stage} · {s.status}</span><span>{s.duration_ms == null ? 'No timing' : ms(s.duration_ms)}</span></div>)}<h2 className="mb-2 mt-6 text-sm font-semibold">Model calls</h2>{detail.calls.length === 0 && <p className="py-2 text-xs text-muted-foreground">No model-call records were stored for this request.</p>}{detail.calls.map((c, i) => <p key={i} className="py-2 text-xs">{c.model} · Attempt {int(c.attempt)} · {c.latency_ms == null ? 'No timing' : ms(c.latency_ms)} · {c.input_tokens == null ? '—' : int(c.input_tokens)} input / {c.output_tokens == null ? '—' : int(c.output_tokens)} output tokens</p>)}</section>}
    </article>)}{!rows.length && !loading && !error && <p className="py-6 text-sm text-muted-foreground">No {kind} match this filter.</p>}</div>{(total>30||page>1)&&<div className="mt-6 flex justify-between"><button className={secondary} disabled={page === 1} onClick={() => { setPage(p => p - 1); setActive(''); }}>Previous</button><button className={secondary} disabled={page * 30 >= total} onClick={() => { setPage(p => p + 1); setActive(''); }}>Next</button></div>}</>}
  </div>;
}
