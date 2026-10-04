'use client';
import { useState } from 'react';
import { api, button, field, type PremiumData } from './shared';

export function OfferEditor({ offer, onSaved }: { offer: PremiumData['offer']; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(offer.enabled);
  const [days, setDays] = useState(offer.days);
  const [off, setOff] = useState(offer.autoOffAt?.slice(0, 10) || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('', { action: 'offer', input: { enabled, days, autoOffOn: off || null, reason } }); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="grid gap-5">
    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="size-4 accent-[var(--console-green)]" />Give new signups free Premium</label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm">Length in days<input className={field} type="number" min="1" max="365" required value={days} onChange={e => setDays(Number(e.target.value))} /></label>
      <label className="grid gap-2 text-sm">Stop offer on (UTC, optional)<input className={field} type="date" value={off} onChange={e => setOff(e.target.value)} /></label>
    </div>
    <label className="grid gap-2 text-sm">Reason<input className={field} required minLength={3} maxLength={300} placeholder="Why are you changing the offer?" value={reason} onChange={e => setReason(e.target.value)} /></label>
    <p className="text-xs leading-5 text-[var(--console-muted)]">Applies to the next signup. Existing grants keep their end dates. An automatic stop takes effect at midnight UTC.</p>
    {error && <p role="alert" className="text-sm text-[var(--console-brick)]">{error}</p>}
    <div><button className={button} disabled={busy}>{busy ? 'Saving…' : 'Save welcome offer'}</button></div>
  </form>;
}
