'use client';
import { useEffect, useState } from 'react';
import { api, field, secondary, date, type Account } from './shared';
import { QuickActions } from './quick-actions';

export function AccountSearch({ selected, onSelect, detail = false, initialAccount }: { selected: Account[]; onSelect: (account: Account) => void; detail?: boolean; initialAccount?: string }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(()=>{
    if(!detail||!initialAccount)return;
    let live=true;setError('');
    api<Account>('?account='+encodeURIComponent(initialAccount)).then(value=>{if(live)setAccount(value);}).catch(e=>{if(live)setError((e as Error).message);});
    return()=>{live=false;};
  },[detail,initialAccount]);
  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setRows(await api<Account[]>('?search=' + encodeURIComponent(query))); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function reload(id: string) {
    try { setAccount(await api<Account>('?account=' + encodeURIComponent(id))); } catch(e) { setError((e as Error).message); }
  }
  async function choose(row: Account) {
    if (!detail) { onSelect(row); return; }
    setError('');
    try { setAccount(await api<Account>('?account=' + row.id)); } catch(e) { setError((e as Error).message); }
  }
  return <div className="grid gap-4">
    <form onSubmit={search} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="account-search">Email, name or handle</label><input id="account-search" className={field + ' min-w-0 flex-1'} value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={100} required placeholder="Search by email, name or handle" /><button className={secondary} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button></form>
    {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
    <div className="divide-y divide-[var(--console-rule)]">{rows.map(row => <button type="button" key={row.id} onClick={() => void choose(row)} className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm hover:bg-[var(--console-panel)]"><span className="min-w-0 break-words"><span className="block font-medium">{row.name || row.email}</span><span className="text-xs text-muted-foreground">{row.email}</span></span><span className="text-xs">{selected.some(a => a.id === row.id) ? 'Selected' : row.plan === 'paying' ? 'Paying, protected' : row.plan === 'complimentary' ? 'Free Premium' : 'Free'}</span></button>)}</div>
    {rows.length === 0 && !busy && <p className="text-sm text-muted-foreground">Search for an account to inspect its plan and grants.</p>}
    {account && <section className="grid gap-2 border-t border-[var(--console-rule)] pt-4"><h3 className="break-all font-medium">{account.name || account.email}</h3>{account.name && <p className="break-all text-xs text-muted-foreground">{account.email}</p>}<p className="text-sm">{account.plan} · Joined {date(account.joinedAt)}</p>
      <QuickActions accountId={account.id} paying={account.plan === 'paying'} onDone={() => void reload(account.id)} />
      <div className="divide-y divide-[var(--console-rule)]">{account.grants?.map(g => <div key={g.id} className="flex flex-wrap justify-between gap-4 py-4 text-sm"><span>{g.kind} · {g.status}</span><span className="text-muted-foreground">{g.startsAt ? date(g.startsAt) : '—'} → {date(g.expiresAt)}</span></div>)}</div></section>}
  </div>;
}
