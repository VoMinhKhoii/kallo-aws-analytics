'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Translate } from '@phosphor-icons/react/ssr';
import { int } from '@/lib/ai-usage/format';
import { field, button, secondary } from '@/components/admin/premium/shared';
import { COLOR_NAMES, EMAIL_COLORS, LOCALES, LOCALE_NAMES, type Locale } from '@/lib/email/brand';
import { contentProblem, hasVersion, unknownTagMessage, unknownTags, type CampaignContent } from '@/lib/email/render';
import { SNIPPETS, TAG_SNIPPETS, TEMPLATES } from '@/lib/email/snippets';
import { describeAudience, type AudienceInput, type ProviderId } from '@/lib/email/input';
import type { CodeEditorHandle } from './code-editor';
import { EmailPreview } from './preview';
import { AudiencePicker } from './audience-picker';
import { emailApi, when, STATUS_LABEL, STATUS_MARK, type AudienceCount, type Campaign, type FailedSend, type ProviderView } from './api';

const CodeEditor = dynamic(() => import('./code-editor').then(m => m.CodeEditor), { ssr: false, loading: () => <div className="h-full animate-pulse bg-[var(--console-surface)]" /> });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MAX_THROTTLES = 12;
const section = 'grid gap-4 border-t border-border pt-5';
const h2 = 'text-base font-medium';
const tool = 'h-8 w-32 rounded-[5px] border border-input bg-transparent px-2 text-xs text-foreground outline-none focus:border-[var(--console-accent)]';
const frame = 'flex h-[640px] min-w-0 flex-col overflow-hidden rounded-[5px] border border-border';

export function CampaignEditor({ initial, failed, providers, testAddress, onBack, onDuplicate, onChanged }: {
  initial: Campaign; failed: FailedSend[]; providers: ProviderView[]; testAddress: string;
  onBack: () => void; onDuplicate: (c: Campaign) => void; onChanged: () => void;
}) {
  const [campaign, setCampaign] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState<CampaignContent>(initial.content);
  const [audience, setAudience] = useState<AudienceInput>(initial.audience);
  const [lang, setLang] = useState<Locale>('en');
  const [sample, setSample] = useState('Mai');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const usable = providers.filter(p => p.configured);
  const [provider, setProvider] = useState<ProviderId>(initial.provider ?? (usable.find(p => p.bulkAllowed) ?? usable[0] ?? providers[0]).id);
  const [testTo, setTestTo] = useState(testAddress);
  const [testLang, setTestLang] = useState<'en' | 'vi' | 'both'>('both');
  const [count, setCount] = useState<AudienceCount | null>(null);
  const [confirming, setConfirming] = useState(false); const [typed, setTyped] = useState('');
  const [failures, setFailures] = useState(failed);
  const editor = useRef<CodeEditorHandle>(null);
  const draining = useRef(false);
  const [live, setLive] = useState(false);
  const locked = campaign.status !== 'draft';
  const info = providers.find(p => p.id === provider)!;
  const tags = unknownTags(content);
  const draft = { name: name.trim() || 'Untitled campaign', content, audience };

  // Every edit bumps the revision, so a save or translation that finishes late can
  // tell whether the founder kept typing while it was out.
  const revision = useRef(0);
  const saving = useRef(false);
  const latest = useRef(content);
  latest.current = content;
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); revision.current++; setDirty(true); setNotice(''); };
  const setLocale = (patch: Partial<CampaignContent[Locale]>) => edit(setContent)({ ...content, [lang]: { ...content[lang], ...patch } });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // The confirmation is for what was reviewed: any change to the email, the
  // audience or the sender disarms it.
  useEffect(() => { setConfirming(false); setTyped(''); }, [content, audience, provider]);
  // A send left running in another visit resumes when the campaign is opened.
  useEffect(() => { if (initial.status === 'sending') void drain(); return () => { draining.current = false; }; }, []);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError('');
    try { return await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function save() {
    // One save at a time (button and Cmd/Ctrl+S alike), so an older draft never
    // lands last, and never while another action holds the editor.
    if (locked || saving.current || busy) return;
    saving.current = true;
    const started = revision.current;
    try {
      const ok = await run('save', () => emailApi('', { action: 'save', id: campaign.id, draft }));
      if (ok) { const current = revision.current === started; if (current) setDirty(false); setNotice(current ? 'Saved.' : 'Saved, but newer edits are not saved yet.'); onChanged(); }
    } finally { saving.current = false; }
  }
  async function translate() {
    const from: Locale = 'en'; const to = lang;
    if (content[to].html.trim() && !window.confirm(`Replace the ${LOCALE_NAMES[to]} version with a fresh translation?`)) return;
    const before = content[to];
    const result = await run('translate', () => emailApi<{ content: CampaignContent[Locale] }>('', { action: 'translate', source: content[from], from, to }));
    if (!result) return;
    // Edits made while it ran stay; if the target itself was edited, keep those instead.
    if (latest.current[to] !== before) { setError(`The ${LOCALE_NAMES[to]} version changed while translating, so the translation was not applied.`); return; }
    setContent(c => ({ ...c, [to]: result.content })); revision.current++; setDirty(true);
    setNotice('Machine translation added. Read it through before sending.');
  }
  function applyTemplate(id: string) {
    const t = TEMPLATES.find(x => x.id === id); if (!t) return;
    if ((content.en.html.trim() || content.vi.html.trim()) && !window.confirm('Replace both language versions with this template?')) return;
    edit(setContent)(structuredClone(t.content));
  }
  async function sendTest() {
    const to = testTo.split(/[\s,;]+/).filter(Boolean);
    const result = await run('test', () => emailApi<{ results: { to: string; locale: string; ok: boolean; error?: string }[] }>('', { action: 'test', provider, content, to, locales: testLang === 'both' ? ['en', 'vi'] : [testLang], name: sample.trim() || null }));
    if (!result) return;
    const bad = result.results.filter(r => !r.ok);
    if (bad.length) setError(bad.map(r => `${r.to} (${r.locale}): ${r.error}`).join(' · '));
    else setNotice(`Test sent to ${[...new Set(result.results.map(r => r.to))].join(', ')}. Check the inbox and the spam folder.`);
  }
  async function start() {
    const result = await run('start', () => emailApi<{ campaign: Campaign }>('', { action: 'start', id: campaign.id, draft, provider, confirm: typed }));
    if (!result) return;
    setCampaign(result.campaign); setDirty(false); setConfirming(false); setTyped(''); onChanged();
    void drain();
  }
  async function drain() {
    if (draining.current) return;
    draining.current = true; setLive(true); setError('');
    try {
      let throttles = 0;
      while (draining.current) {
        const r = await emailApi<{ claimed: number; throttled: string | null; stalled: boolean; campaign: Campaign }>('', { action: 'deliver', id: campaign.id });
        setCampaign(r.campaign);
        if (r.campaign.status !== 'sending') break;
        // About a minute of throttling in a row is a quota, not a burst: stop and say so.
        throttles = r.stalled ? throttles + 1 : 0;
        if (throttles >= MAX_THROTTLES) { setError(`Sending paused: ${r.throttled}. The sender is refusing more email for now; resume later.`); break; }
        // Throttled, or the last emails are still in flight from another tab.
        if (r.throttled || !r.claimed) await sleep(r.throttled ? 5000 : 3000);
      }
      const detail = await emailApi<{ campaign: Campaign; failed: FailedSend[] }>(`?campaign=${encodeURIComponent(campaign.id)}`);
      setCampaign(detail.campaign); setFailures(detail.failed); onChanged();
    } catch (e) { setError(`Sending paused: ${(e as Error).message}`); }
    finally { draining.current = false; setLive(false); }
  }
  async function cancel() {
    if (!window.confirm('Stop sending? People not reached yet will not get it. Emails already sent stay sent.')) return;
    draining.current = false;
    const r = await run('cancel', () => emailApi<{ campaign: Campaign }>('', { action: 'cancel', id: campaign.id }));
    if (r) { setCampaign(r.campaign); onChanged(); }
  }
  async function remove() {
    if (!window.confirm(`Delete the draft “${campaign.name}”?`)) return;
    if (await run('delete', () => emailApi('', { action: 'delete', id: campaign.id }))) { setDirty(false); onChanged(); onBack(); }
  }

  const c = campaign.counts;
  const done = c.sent + c.failed + c.skipped;
  const sending = campaign.status === 'sending';
  const problem = contentProblem(content);
  const canSend = !locked && !problem && info.configured && (count?.reachable ?? 0) > 0;

  // While a send is starting, nothing can change: what goes out is what was confirmed.
  return <fieldset disabled={busy === 'start'} className="m-0 grid min-w-0 gap-6 border-0 p-0" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save(); } }}>
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className={secondary} onClick={() => { if (!dirty || window.confirm('Leave without saving?')) onBack(); }}><ArrowLeft className="size-3.5" aria-hidden />Campaigns</button>
      <input aria-label="Campaign name" maxLength={120} className={field + ' max-w-md flex-1 font-medium'} value={name} disabled={locked} onChange={e => edit(setName)(e.target.value)} placeholder="Campaign name" />
      <span className={'text-sm ' + STATUS_MARK[campaign.status]}>{STATUS_LABEL[campaign.status]}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!locked && <span className="self-center text-xs text-[var(--console-faint)]">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>}
        {!locked && <button type="button" className={secondary} disabled={!!busy} onClick={() => void remove()}>Delete</button>}
        <button type="button" className={secondary} disabled={!!busy} onClick={() => onDuplicate({ ...campaign, name: draft.name, content, audience })}>Duplicate</button>
        {!locked && <button type="button" className={button + ' h-8 px-3 text-xs'} disabled={!!busy || !dirty} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
    {notice && <p role="status" className="text-sm text-foreground mark-good">{notice}</p>}

    {locked && <section className={section}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium tabular">{int(c.sent)} sent · {int(c.failed)} failed · {int(c.skipped)} skipped{(c.queued + c.sending) > 0 && ` · ${int(c.queued + c.sending)} to go`} <span className="font-normal text-muted-foreground">of {int(campaign.total)}</span></p>
        <p className="text-xs text-[var(--console-faint)]">{describeAudience(campaign.audience)} · from {campaign.sender} · started {when(campaign.startedAt)}{campaign.finishedAt && ` · finished ${when(campaign.finishedAt)}`}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--console-rule)]" role="progressbar" aria-valuemin={0} aria-valuemax={campaign.total} aria-valuenow={done} aria-label="Sending progress">
        <div className="h-full bg-[var(--console-data)] transition-[width]" style={{ width: `${campaign.total ? (done / campaign.total) * 100 : 0}%` }} />
      </div>
      {sending && <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground">{live ? 'Sending… keep this tab open. Closing it pauses the send; open the campaign again to resume.' : 'Paused.'}</p>
        {!live && <button type="button" className={button} onClick={() => void drain()}>Resume sending</button>}
        <button type="button" className={secondary} onClick={() => void cancel()}>Stop sending</button>
      </div>}
      {failures.length > 0 && <details className="text-sm"><summary className="cursor-pointer">{int(c.failed)} failed {c.failed === 1 ? 'address' : 'addresses'}{c.failed > failures.length && `, first ${int(failures.length)} shown`}</summary>
        <ul className="mt-2 divide-y divide-border border-y border-border text-xs text-muted-foreground">{failures.map(f => <li key={f.email} className="py-2"><span className="text-foreground">{f.email}</span> · {f.error}</li>)}</ul></details>}
    </section>}

    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-border">
        <div role="tablist" aria-label="Language" className="flex gap-6">
          {LOCALES.map(l => <button key={l} role="tab" type="button" aria-selected={lang === l} onClick={() => setLang(l)} className="-mb-px border-b-2 border-transparent py-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)] aria-selected:border-[var(--console-accent)] aria-selected:text-foreground">
            {LOCALE_NAMES[l]}{l !== 'en' && !hasVersion(content, l) && <span className="ml-2 text-xs text-[var(--console-amber)]">uses English</span>}
          </button>)}
        </div>
        {lang !== 'en' && !locked && <button type="button" className={secondary + ' mb-2'} disabled={!!busy || !content.en.html.trim()} onClick={() => void translate()}><Translate className="size-3.5" aria-hidden />{busy === 'translate' ? 'Translating…' : 'Translate from English'}</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Subject<input className={field} disabled={locked} value={content[lang].subject} maxLength={300} onChange={e => setLocale({ subject: e.target.value })} placeholder={lang === 'en' ? 'What people see in their inbox' : content.en.subject || 'Falls back to English'} /></label>
        <label className="grid gap-2 text-sm">Preview text<input className={field} disabled={locked} value={content[lang].preheader} maxLength={300} onChange={e => setLocale({ preheader: e.target.value })} placeholder="The grey line after the subject" /></label>
      </div>
      {lang !== 'en' && <p className="-mt-2 text-xs text-[var(--console-faint)]">People whose app is set to {LOCALE_NAMES[lang]} get this version. Leave it empty and they get the English one.</p>}
      <div className="grid min-h-0 gap-4 lg:grid-cols-2">
        <div className={frame}>
          {!locked && <div className="flex flex-wrap gap-2 border-b border-border p-2">
            <select aria-label="Start from a template" className={tool} value="" onChange={e => applyTemplate(e.target.value)}><option value="">Template…</option>{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            <select aria-label="Insert a block" className={tool} value="" onChange={e => { const s = SNIPPETS.find(x => x.label === e.target.value); if (s) editor.current?.insert(s.html); }}><option value="">Insert block…</option>{SNIPPETS.map(s => <option key={s.label}>{s.label}</option>)}</select>
            <select aria-label="Insert a merge tag" className={tool} value="" onChange={e => e.target.value && editor.current?.insert(e.target.value)}><option value="">Merge tag…</option>{TAG_SNIPPETS.map(t => <option key={t.html} value={t.html}>{t.label} {t.html}</option>)}</select>
            <select aria-label="Insert a brand color" className={tool} value="" onChange={e => e.target.value && editor.current?.insert(e.target.value)}><option value="">Brand color…</option>{Object.entries(EMAIL_COLORS).map(([k, v]) => <option key={k} value={v}>{COLOR_NAMES[k as keyof typeof EMAIL_COLORS]} {v}</option>)}</select>
          </div>}
          <div className="min-h-0 flex-1"><CodeEditor ref={editor} label={`${LOCALE_NAMES[lang]} HTML body`} value={content[lang].html} readOnly={locked || busy === 'start'} onChange={html => setLocale({ html })} /></div>
        </div>
        <div className={frame}>
          <EmailPreview content={content} locale={lang} name={sample} from={info.from} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-2 text-sm">Preview with the name<input className={field + ' w-48'} value={sample} onChange={e => setSample(e.target.value)} placeholder="Empty shows the fallback" /></label>
        <p className="pb-2 text-xs text-[var(--console-faint)]">The Kallo logo, footer and unsubscribe link are added to every email. Write only the part inside the card.</p>
      </div>
      {tags.length > 0 && <p role="alert" className="text-sm text-foreground mark-bad">{unknownTagMessage(tags)}</p>}
    </section>

    <section className={section + ' max-w-3xl'}>
      <h2 className={h2}>Audience</h2>
      {locked ? <p className="text-sm">{describeAudience(campaign.audience)}</p> : <AudiencePicker value={audience} onChange={edit(setAudience)} onCount={setCount} />}
    </section>

    {!locked && <section className={section + ' max-w-3xl'}>
      <h2 className={h2}>Send</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Send with<select className={field} value={provider} onChange={e => setProvider(e.target.value as ProviderId)}>{providers.map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.label} · {p.from}{p.configured ? '' : ' (not set up)'}</option>)}</select></label>
        <div className="grid content-end text-xs text-muted-foreground">{!info.configured ? <p className="text-foreground mark-bad">{info.label} is not set up. {info.setup}</p> : !info.bulkAllowed ? <p className="mark-warn">Cloudflare Email is meant for one-to-one mail like sign-in codes. Fine for tests; for a real campaign use Resend, so a flagged campaign can’t block Kallo’s sign-up emails.</p> : <p>Replies go to support@kallo.fit.</p>}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="grid gap-2 text-sm">Send a test to<input className={field} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@kallo.fit, teammate@…" /></label>
        <label className="grid gap-2 text-sm">Language<select className={field} value={testLang} onChange={e => setTestLang(e.target.value as typeof testLang)}><option value="both">Both</option><option value="en">English</option><option value="vi">Vietnamese</option></select></label>
        <button type="button" className={secondary + ' h-9'} disabled={!!busy || !info.configured || !testTo.trim() || tags.length > 0} onClick={() => void sendTest()}>{busy === 'test' ? 'Sending…' : 'Send test'}</button>
        <p className="text-xs text-[var(--console-faint)] sm:col-span-3">Tests are marked [Test], use the name above, and are not counted. Their unsubscribe link does nothing.</p>
      </div>
      {!confirming
        ? <div><button type="button" className={button} disabled={!canSend || !!busy} onClick={() => setConfirming(true)}>Review and send…</button>
          {!canSend && <p className="mt-2 text-xs text-[var(--console-faint)]">{problem ?? (!info.configured ? 'Set up a sender first.' : !count ? 'Waiting for the audience count.' : count.reachable === 0 ? 'Nobody matches this audience.' : '')}</p>}</div>
        : <div className="grid gap-4 border-t border-border pt-5">
          <p className="text-sm font-medium">Send “{draft.name}” to {int(count?.reachable ?? 0)} {count?.reachable === 1 ? 'person' : 'people'} with {info.label}, from {info.from}?</p>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            <li>Audience: {describeAudience(audience)} · {int(count?.byLocale.en ?? 0)} get English, {int(count?.byLocale.vi ?? 0)} get Vietnamese{!hasVersion(content, 'vi') && ' (falls back to English)'}.</li>
            <li>The email is locked once sending starts. Sending can be stopped, but sent emails can’t be recalled.</li>
            {!info.bulkAllowed && <li className="text-[var(--console-amber)]">This goes through Cloudflare Email, which is meant for one-to-one mail.</li>}
          </ul>
          <label className="grid max-w-xs gap-2 text-sm">Type SEND to confirm<input className={field} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label>
          <div className="flex flex-wrap gap-4"><button type="button" className={button} disabled={!canSend || typed !== 'SEND' || !!busy} onClick={() => void start()}>{busy === 'start' ? 'Starting…' : 'Send now'}</button><button type="button" className={secondary + ' h-9'} disabled={!!busy} onClick={() => { setConfirming(false); setTyped(''); }}>Cancel</button></div>
        </div>}
    </section>}
  </fieldset>;
}
