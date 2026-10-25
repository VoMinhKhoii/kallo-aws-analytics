'use client';
import { useState } from 'react';
import { api, button, field, secondary } from './shared';

type Pending = { kind: 'give'; days: number } | { kind: 'end' } | null;

/** One account: add days on top of its free time, or end free Premium now. Each needs a reason and can be undone from Activity. */
export function QuickActions({ accountId, paying, onDone }: { accountId: string; paying: boolean; onDone: () => void }) {
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const who = { kind: 'users', userIds: [accountId] };
  async function apply(e: React.FormEvent) {
    e.preventDefault(); if (!pending) return; setBusy(true); setError('');
    try {
      await api('', pending.kind === 'give'
        ? { action: 'give', input: { who, mode: 'extend', length: { unit: 'days', days: pending.days }, reason } }
        : { action: 'end', input: { who, reason } });
      setPending(null); setReason(''); onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (paying) return <p className="text-xs text-muted-foreground">Paying account: free Premium cannot be given or ended here.</p>;
  return <div className="grid gap-2">
    <div className="flex flex-wrap gap-2">{[7, 14, 30].map(days => <button key={days} type="button" className={secondary} disabled={busy} onClick={() => { setPending({ kind: 'give', days }); setError(''); }}>+{days} days</button>)}
      <button type="button" className={secondary} disabled={busy} onClick={() => { setPending({ kind: 'end' }); setError(''); }}>End now</button></div>
    {pending && <form onSubmit={apply} className="grid gap-2">
      <p className="text-xs text-muted-foreground">{pending.kind === 'give' ? `Add ${pending.days} days on top of any free time left.` : 'End this account’s free Premium now.'} Undo it from Activity.</p>
      <label className="sr-only" htmlFor={`quick-reason-${accountId}`}>Reason</label>
      <input id={`quick-reason-${accountId}`} className={field} required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" />
      {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy}>{busy ? 'Saving…' : pending.kind === 'give' ? 'Add days' : 'End now'}</button><button type="button" className={secondary} disabled={busy} onClick={() => setPending(null)}>Cancel</button></div>
    </form>}
  </div>;
}
