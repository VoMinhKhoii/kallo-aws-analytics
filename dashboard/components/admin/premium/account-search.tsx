'use client';
import { useState } from 'react';
import { api, field, secondary, date, type Account } from './shared';

export function AccountSearch({ selected, onSelect, detail = false }: { selected: Account[]; onSelect: (account: Account) => void; detail?: boolean }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setRows(await api<Account[]>('?search=' + encodeURIComponent(query))); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function choose(row: Account) {
    if (!detail) { onSelect(row); return; }
    setError('');
    try { setAccount(await api<Account>('?account=' + row.id)); } catch(e) { setError((e as Error).message); }
  }
  return <div className="grid gap-4">
    <form onSubmit={search} className="flex gap-2"><label className="sr-only" htmlFor="account-search">Email, name or handle</label><input id="account-search" className={field} value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={100} required placeholder="Search by email, name or handle" /><button className={secondary} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button></form>
    {error && <p role="alert" className="text-sm text-[var(--console-brick)]">{error}</p>}
    <div className="divide-y divide-[var(--console-rule)]">{rows.map(row => <button type="button" key={row.id} onClick={() => void choose(row)} className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm hover:bg-[var(--console-panel)]"><span><span className="block font-medium">{row.name || row.email}</span><span className="text-xs text-[var(--console-muted)]">{row.email}</span></span><span className="text-xs">{selected.some(a => a.id === row.id) ? 'Selected' : row.plan === 'paying' ? 'Paying, protected' : row.plan === 'complimentary' ? 'Free Premium' : 'Free'}</span></button>)}</div>
    {rows.length === 0 && !busy && <p className="text-sm text-[var(--console-muted)]">Search for an account to inspect its plan and grants.</p>}
    {account && <section className="border-t border-[var(--console-rule)] pt-4"><h3 className="font-medium">{account.email}</h3><p className="my-2 text-sm">{account.plan} · Joined {date(account.joinedAt)}</p><div className="divide-y divide-[var(--console-rule)]">{account.grants?.map(g => <div key={g.id} className="flex justify-between gap-3 py-3 text-sm"><span>{g.kind} · {g.status}</span><span>{date(g.expiresAt)}</span></div>)}</div></section>}
  </div>;
}
