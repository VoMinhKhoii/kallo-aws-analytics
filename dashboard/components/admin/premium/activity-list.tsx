'use client';
import { useState } from 'react';
import { api, date, secondary, button, field, type Activity } from './shared';

export function ActivityList({ rows, onSaved }: { rows: Activity[]; onSaved: () => void }) {
  const [undo, setUndo] = useState<string | null>(null);
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function apply(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('', { action: 'undo', input: { id: undo, reason } }); setUndo(null); setReason(''); onSaved(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!rows.length) return <p className="py-6 text-sm text-[var(--console-muted)]">No admin actions yet. Changes to the welcome offer and Premium grants will appear here.</p>;
  return <div className="divide-y divide-[var(--console-rule)]">{rows.map(row => <div className="py-4" key={row.id}>
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium capitalize">{row.action} · {row.scope} · {row.userCount} accounts</p><p className="mt-1 text-sm">{row.reason || 'No reason recorded'}</p><p className="mt-2 text-xs text-[var(--console-muted)]">{date(row.createdAt)} · {row.adminEmail}</p></div>{row.undoneAt ? <span className="text-xs text-[var(--console-muted)]">Undone</span> : row.action !== 'undo' && <button className={secondary} onClick={() => { setUndo(row.id); setReason(''); setError(''); }}>Undo</button>}</div>
    {undo === row.id && <form onSubmit={apply} className="mt-4 grid gap-3"><p className="text-xs text-[var(--console-muted)]">Restore the change recorded by this action. Later actions remain in place.</p><label className="sr-only" htmlFor="undo-reason">Reason for undo</label><input id="undo-reason" className={field} required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for undo" />{error && <p role="alert" className="text-sm text-[var(--console-brick)]">{error}</p>}<div className="flex gap-2"><button className={button} disabled={busy}>{busy ? 'Undoing…' : 'Confirm undo'}</button><button type="button" className={secondary} disabled={busy} onClick={() => setUndo(null)}>Cancel</button></div></form>}
  </div>)}</div>;
}
