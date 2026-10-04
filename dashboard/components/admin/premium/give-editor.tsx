'use client';
import { useState } from 'react';
import { AccountSearch } from './account-search';
import { api, field, button, secondary, type Account } from './shared';

export function GiveEditor({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState('users');
  const [selected, setSelected] = useState<Account[]>([]);
  const [plan, setPlan] = useState('free');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [action, setAction] = useState('give'); const [mode, setMode] = useState('extend');
  const [unit, setUnit] = useState('days'); const [days, setDays] = useState(14); const [until, setUntil] = useState('');
  const [reason, setReason] = useState(''); const [confirm, setConfirm] = useState('');
  const [preview, setPreview] = useState<{ accounts: number; payingSkipped: number } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const who = kind === 'users' ? { kind, userIds: selected.map(a => a.id) } : kind === 'group' ? { kind, plan, joinedFrom: from || undefined, joinedTo: to || undefined } : { kind };
  function change(fn: () => void) { fn(); setPreview(null); setConfirm(''); }
  async function review(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setPreview(await api('', { action: 'preview', input: who })); } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError('');
    try { await api('', { action, input: { who, reason, confirm, mode, length: unit === 'days' ? { unit, days } : { unit, until } } }); setPreview(null); setConfirm(''); onSaved(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="grid gap-5">
    <label className="grid gap-2 text-sm">Who<select className={field} value={kind} onChange={e => change(() => setKind(e.target.value))}><option value="users">Selected accounts</option><option value="group">A group</option><option value="everyone">Everyone who is not paying</option></select></label>
    {kind === 'users' && <><AccountSearch selected={selected} onSelect={a => change(() => setSelected(selected.some(s => s.id === a.id) ? selected.filter(s => s.id !== a.id) : [...selected, a]))} /><div className="flex flex-wrap gap-2">{selected.map(a => <button key={a.id} className={secondary} onClick={() => change(() => setSelected(selected.filter(s => s.id !== a.id)))}>{a.email} ×</button>)}</div></>}
    <form onSubmit={review} className="grid gap-5">
      {kind === 'group' && <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-2 text-sm">Plan<select className={field} value={plan} onChange={e => change(() => setPlan(e.target.value))}><option value="free">Free</option><option value="complimentary">On free Premium</option><option value="not_paying">Not paying</option></select></label><label className="grid gap-2 text-sm">Joined from<input type="date" className={field} value={from} onChange={e => change(() => setFrom(e.target.value))} /></label><label className="grid gap-2 text-sm">Joined through<input type="date" className={field} value={to} onChange={e => change(() => setTo(e.target.value))} /></label></div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Action<select className={field} value={action} onChange={e => change(() => setAction(e.target.value))}><option value="give">Give free Premium</option><option value="end">End free Premium</option></select></label>{action === 'give' && <label className="grid gap-2 text-sm">Mode<select className={field} value={mode} onChange={e => change(() => setMode(e.target.value))}><option value="extend">Extend existing free time</option><option value="restart">Restart from now</option></select></label>}</div>
      {action === 'give' && <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Length<select className={field} value={unit} onChange={e => change(() => setUnit(e.target.value))}><option value="days">Number of days</option><option value="until">Until a date (UTC)</option></select></label><label className="grid gap-2 text-sm">{unit === 'days' ? 'Days' : 'End date'}{unit === 'days' ? <input type="number" className={field} min={1} max={365} required value={days} onChange={e => change(() => setDays(Number(e.target.value)))} /> : <input type="date" className={field} required value={until} onChange={e => change(() => setUntil(e.target.value))} />}</label></div>}
      <label className="grid gap-2 text-sm">Reason<input className={field} required minLength={3} maxLength={300} value={reason} onChange={e => change(() => setReason(e.target.value))} placeholder="Record why this change is needed" /></label>
      <p className="text-xs text-[var(--console-muted)]">Paying subscribers are protected. Each change is recorded and can be undone.</p>
      <div><button className={secondary} disabled={busy}>{busy ? 'Checking…' : 'Preview affected accounts'}</button></div>
    </form>
    {preview && <div className="grid gap-4 rounded-md border border-[var(--console-rule)] bg-[var(--console-panel)] p-5"><p className="text-sm font-medium">{preview.accounts} eligible accounts · {preview.payingSkipped} paying accounts skipped</p>{kind === 'everyone' && <label className="grid gap-2 text-sm">Type {action === 'end' ? 'END' : 'EVERYONE'} to confirm<input className={field} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}<div className="flex gap-3"><button className={button} onClick={() => void apply()} disabled={busy || preview.accounts === 0 || (kind === 'everyone' && confirm !== (action === 'end' ? 'END' : 'EVERYONE'))}>{busy ? 'Applying…' : action === 'end' ? 'Confirm end free Premium' : 'Confirm give Premium'}</button><button className={secondary} onClick={() => setPreview(null)} disabled={busy}>Cancel</button></div></div>}
    {error && <p role="alert" className="text-sm text-[var(--console-brick)]">{error}</p>}
  </div>;
}
