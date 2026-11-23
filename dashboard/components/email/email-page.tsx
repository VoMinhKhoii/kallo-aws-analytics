'use client';
import { useCallback, useEffect, useState } from 'react';
import { int } from '@/lib/ai-usage/format';
import { useUrlState } from '@/lib/use-url-state';
import { useSessionRole } from '@/lib/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { UrlTabs } from '@/components/shared/url-tabs';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { MetricSection } from '@/components/shared/metric-section';
import { field, secondary } from '@/components/admin/premium/shared';
import type { Template } from '@/lib/email/snippets';
import { describeAudience } from '@/lib/email/input';
import type { Suppression } from '@/lib/email/store';
import { CampaignEditor } from './campaign-editor';
import { TemplateGallery } from './template-gallery';
import { emailApi, when, STATUS_LABEL, STATUS_MARK, type Campaign, type EmailHome, type FailedSend } from './api';

export default function EmailPage() {
  const auth = useSessionRole();
  const [tab, setTab] = useUrlState('tab', 'campaigns', ['campaigns', 'unsubscribed']);
  const [openId, setOpenId] = useUrlState('campaign', '');
  const [home, setHome] = useState<EmailHome | null>(null);
  const [open, setOpen] = useState<{ campaign: Campaign; failed: FailedSend[] } | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const founder = auth.role === 'founder';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setHome(await emailApi<EmailHome>()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (founder) void load(); else if (!auth.loading) setLoading(false); }, [founder, auth.loading, load]);
  useEffect(() => {
    if (!founder || !openId) { setOpen(null); return; }
    let live = true;
    emailApi<{ campaign: Campaign; failed: FailedSend[] }>(`?campaign=${encodeURIComponent(openId)}`).then(v => { if (live) setOpen(v); }, e => { if (live) { setError((e as Error).message); setOpenId(''); } });
    return () => { live = false; };
  }, [founder, openId]);

  async function create(draft: { name: string; content: Campaign['content']; audience: Campaign['audience'] }) {
    setError('');
    try { const { id } = await emailApi<{ id: string }>('', { action: 'create', draft }); setOpen(null); setOpenId(id); void load(); }
    catch (e) { setError((e as Error).message); }
  }
  const fresh = (t: Template) => void create({ name: `${t.label} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, content: structuredClone(t.content), audience: structuredClone(t.audience ?? { kind: 'everyone' }) });

  const setup = home && !home.setup.store ? 'The email database is not bound (EMAIL_DB in wrangler.jsonc).' : home && !home.setup.linkSecret ? 'EMAIL_LINK_SECRET is not set, so campaigns cannot be sent yet (test sends work). It signs the unsubscribe links.' : '';
  return <div className="space-y-6">
    <PageHeader title="Email" refreshing={loading} onRefresh={open ? undefined : () => { if (founder) void load(); }} />
    {auth.error ? <p role="alert" className="text-sm">Session unavailable: {auth.error}. Use Refresh to retry.</p>
      : !founder && !auth.loading ? <p className="text-sm">Sending email requires founder access. Sign in with your founder account.</p>
      : <>
        {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
        {setup && <p className="text-sm text-foreground mark-warn">{setup}</p>}
        {openId ? (open && home ? <CampaignEditor key={open.campaign.id} initial={open.campaign} failed={open.failed} providers={home.providers} testAddress={home.testAddress} onBack={() => setOpenId('')} onChanged={() => void load()} onDuplicate={c => void create({ name: `Copy of ${c.name}`.slice(0, 120), content: c.content, audience: c.audience })} /> : <PageSkeleton title="Campaign" cells={0} charts={1} rows />)
          : <UrlTabs value={tab} onChange={setTab} items={[{ value: 'campaigns', label: 'Campaigns' }, { value: 'unsubscribed', label: 'Unsubscribed' }]}>
            {tab === 'campaigns' && <Campaigns home={home} loading={loading} onNew={fresh} onOpen={setOpenId} />}
            {tab === 'unsubscribed' && <Unsubscribed />}
          </UrlTabs>}
      </>}
  </div>;
}

function Campaigns({ home, loading, onNew, onOpen }: { home: EmailHome | null; loading: boolean; onNew: (t: Template) => void; onOpen: (id: string) => void }) {
  if (!home) return loading ? <PageSkeleton title="Campaigns" cells={0} charts={0} rows /> : null;
  const gallery = <MetricSection title="Start a campaign" action={<p className="text-xs text-[var(--console-faint)]">Senders: {home.providers.map(p => `${p.label} ${p.configured ? '✓' : '(not set up)'}`).join(' · ')}</p>}>
    <TemplateGallery onPick={onNew} disabled={!home.setup.store} />
  </MetricSection>;
  if (home.campaigns.length === 0) return <div className="grid gap-6"><p className="text-sm text-muted-foreground">No campaigns yet. Pick a format below to start a draft; drafts are saved until you send them.</p>{gallery}</div>;
  return <div className="grid gap-10">
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead><tr className="h-9 border-y border-border text-left text-xs text-[var(--console-faint)]"><th className="font-normal">Campaign</th><th className="font-normal">Status</th><th className="font-normal">Audience</th><th className="text-right font-normal">Sent</th><th className="text-right font-normal">Failed</th><th className="pl-6 font-normal">Updated</th></tr></thead>
        <tbody>{home.campaigns.map(c => <tr key={c.id} className="h-12 border-b border-border transition-colors hover:bg-secondary">
          <td className="py-2"><button type="button" className="text-left hover:underline" onClick={() => onOpen(c.id)}>{c.name}</button></td>
          <td className={STATUS_MARK[c.status]}>{STATUS_LABEL[c.status]}{c.status === 'sending' && <span className="text-xs text-[var(--console-faint)]"> · {int(c.counts.queued + c.counts.sending)} to go</span>}</td>
          <td className="text-muted-foreground">{describeAudience(c.audience)}</td>
          <td className="text-right tabular">{c.status === 'draft' ? '—' : int(c.counts.sent)}</td>
          <td className="text-right tabular">{c.status === 'draft' ? '—' : int(c.counts.failed)}</td>
          <td className="pl-6 text-muted-foreground">{when(c.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>
    {gallery}
  </div>;
}

function Unsubscribed() {
  const [data, setData] = useState<{ rows: Suppression[]; total: number } | null>(null);
  const [email, setEmail] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await emailApi('?suppressions=1')); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function act(action: 'suppress' | 'unsuppress', address: string) {
    if (action === 'unsuppress' && !window.confirm(`Send campaigns to ${address} again? Only do this if they asked to be added back.`)) return;
    setBusy(true); setError('');
    try { await emailApi('', { action, email: address }); setEmail(''); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const reason = { unsubscribed: 'Unsubscribed', bounced: 'Bounced', manual: 'Added by hand' };
  return <div className="grid max-w-3xl gap-6">
    <p className="text-sm text-muted-foreground">These addresses never get campaign email. People land here when they click Unsubscribe, when their address bounces, or when you add them. Sign-in and account emails are not affected.</p>
    <form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); void act('suppress', email); }}>
      <label className="grid flex-1 gap-2 text-sm">Add an address<input type="email" required className={field} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
      <button className={secondary + ' h-9'} disabled={busy}>Add</button>
    </form>
    {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
    {!data ? <PageSkeleton title="Unsubscribed" cells={0} charts={0} rows /> : data.rows.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has unsubscribed.</p>
      : <div><p className="mb-2 text-xs text-[var(--console-faint)]">{int(data.total)} address{data.total === 1 ? '' : 'es'}{data.total > data.rows.length && `, newest ${data.rows.length} shown`}</p>
        <div className="divide-y divide-border border-y border-border">{data.rows.map(r => <div key={r.email} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <span className="break-all">{r.email}</span>
          <span className="flex items-center gap-4 text-xs text-[var(--console-faint)]">{reason[r.reason]} · {when(r.createdAt)}<button type="button" className="text-muted-foreground hover:text-foreground hover:underline" disabled={busy} onClick={() => void act('unsuppress', r.email)}>Remove</button></span>
        </div>)}</div></div>}
  </div>;
}
