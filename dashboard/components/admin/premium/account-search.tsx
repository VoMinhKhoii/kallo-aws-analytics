'use client';
import { useEffect, useRef, useState } from 'react';
import { api, field, secondary, date, type Account } from './shared';
import { QuickActions } from './quick-actions';

export function AccountSearch({ selected, onSelect, detail = false, initialAccount, onChanged }: { selected: Account[]; onSelect: (account: Account) => void; detail?: boolean; initialAccount?: string; onChanged?: () => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The account the founder picked last; a slower read for an earlier pick never replaces it.
  const wanted = useRef<string | null>(null);
  async function show(id: string) {
    try { const value = await api<Account>('?account=' + encodeURIComponent(id)); if (wanted.current === id) setAccount(value); }
    catch(e) { if (wanted.current === id) setError((e as Error).message); }
  }
  useEffect(()=>{
    if(!detail||!initialAccount)return;
    setError('');wanted.current=initialAccount;void show(initialAccount);
    return()=>{if(wanted.current===initialAccount)wanted.current=null;};
  },[detail,initialAccount]);
  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setRows(await api<Account[]>('?search=' + encodeURIComponent(query))); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function choose(row: Account) {
    if (!detail) { onSelect(row); return; }
    setError(''); wanted.current = row.id;
    await show(row.id);
  }
  return <div className="grid gap-4">
    <form onSubmit={search} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="account-search">Email, name or handle</label><input id="account-search" className={field + ' min-w-0 flex-1'} value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={100} required placeholder="Search by email, name or handle" /><button className={secondary} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button></form>
    {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
    <div className="divide-y divide-[var(--console-rule)]">{rows.map(row => <button type="button" key={row.id} onClick={() => void choose(row)} className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm hover:bg-[var(--console-panel)]"><span className="min-w-0 break-words"><span className="block font-medium">{row.name || row.email}</span><span className="text-xs text-muted-foreground">{row.email}</span></span><span className="text-xs">{selected.some(a => a.id === row.id) ? 'Selected' : row.plan === 'paying' ? 'Paying, protected' : row.plan === 'complimentary' ? 'Free Premium' : 'Free'}</span></button>)}</div>
    {rows.length === 0 && !busy && <p className="text-sm text-muted-foreground">Search for an account to inspect its plan and grants.</p>}
    {account && <section className="grid gap-2 border-t border-[var(--console-rule)] pt-4"><h3 className="break-all font-medium">{account.name || account.email}</h3>{account.name && <p className="break-all text-xs text-muted-foreground">{account.email}</p>}<p className="text-sm">{account.plan} · Joined {date(account.joinedAt)}</p>
      <QuickActions key={account.id} accountId={account.id} paying={account.plan === 'paying'} onDone={() => { void show(account.id); onChanged?.(); }} />
      <div className="divide-y divide-[var(--console-rule)]">{account.grants?.map(g => <div key={g.id} className="flex flex-wrap justify-between gap-4 py-4 text-sm"><span>{g.kind} · {g.status}</span><span className="text-muted-foreground">{g.startsAt ? date(g.startsAt) : '—'} → {date(g.expiresAt)}</span></div>)}</div></section>}
  </div>;
}
