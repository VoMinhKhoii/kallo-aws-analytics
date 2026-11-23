'use client';
import { useEffect, useRef, useState } from 'react';
import { int } from '@/lib/ai-usage/format';
import { AccountSearch } from '@/components/admin/premium/account-search';
import { field, secondary, type Account } from '@/components/admin/premium/shared';
import type { AudienceInput } from '@/lib/email/input';
import { emailApi, type AudienceCount } from './api';

type Group = Extract<AudienceInput, { kind: 'group' }>;
const defaults: Group = { kind: 'group', plan: 'any', activity: 'any', language: 'any' };

/** Who gets the campaign, with a live count of who it reaches. */
export function AudiencePicker({ value, onChange, onCount }: { value: AudienceInput; onChange: (a: AudienceInput) => void; onCount?: (c: AudienceCount | null) => void }) {
  const [picked, setPicked] = useState<Account[]>([]);
  const [count, setCount] = useState<AudienceCount | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const asked = useRef('');
  const group = value.kind === 'group' ? value : defaults;
  const key = JSON.stringify(value);

  useEffect(() => {
    setCount(null); onCount?.(null); setError('');
    // Claim the key first, so a count still in flight for the old audience is ignored.
    asked.current = key;
    if (value.kind === 'users' && !value.userIds.length) { setBusy(false); return; }
    const timer = setTimeout(async () => {
      setBusy(true);
      try { const c = await emailApi<AudienceCount>('', { action: 'count', audience: value }); if (asked.current === key) { setCount(c); onCount?.(c); } }
      catch (e) { if (asked.current === key) setError((e as Error).message); }
      finally { if (asked.current === key) setBusy(false); }
    }, 400);
    return () => clearTimeout(timer);
    // `key` stands for `value`.
  }, [key]);

  const set = (patch: Partial<Group>) => onChange({ ...group, ...patch });
  // The saved IDs are the selection; `picked` only holds labels for the ones chosen
  // in this visit, so accounts picked earlier stay in until removed.
  const ids = value.kind === 'users' ? value.userIds : [];
  const toggle = (a: Account) => {
    const has = ids.includes(a.id);
    setPicked(p => has ? p.filter(x => x.id !== a.id) : [...p.filter(x => x.id !== a.id), a]);
    onChange({ kind: 'users', userIds: has ? ids.filter(id => id !== a.id) : [...ids, a.id] });
  };
  const labelled = picked.filter(a => ids.includes(a.id));
  const earlier = ids.length - labelled.length;

  return <div className="grid gap-4">
    <label className="grid gap-2 text-sm">Send to
      <select className={field} value={value.kind} onChange={e => onChange(e.target.value === 'group' ? defaults : e.target.value === 'users' ? { kind: 'users', userIds: picked.map(a => a.id) } : { kind: 'everyone' })}>
        <option value="everyone">Everyone</option><option value="group">A group</option><option value="users">Picked accounts</option>
      </select>
    </label>
    {value.kind === 'group' && <div className="grid gap-4 sm:grid-cols-3">
      <label className="grid gap-2 text-sm">Plan<select className={field} value={group.plan} onChange={e => set({ plan: e.target.value as Group['plan'] })}><option value="any">Any plan</option><option value="paying">Paying</option><option value="complimentary">On free Premium</option><option value="free">Free plan</option></select></label>
      <label className="grid gap-2 text-sm">Activity<select className={field} value={group.activity} onChange={e => set({ activity: e.target.value as Group['activity'] })}><option value="any">Any</option><option value="active7">Logged a meal in 7 days</option><option value="active30">Logged a meal in 30 days</option><option value="inactive30">No meal in 30 days</option></select></label>
      <label className="grid gap-2 text-sm">App language<select className={field} value={group.language} onChange={e => set({ language: e.target.value as Group['language'] })}><option value="any">Any</option><option value="en">English</option><option value="vi">Vietnamese</option></select></label>
      <label className="grid gap-2 text-sm">Joined from<input type="date" className={field} value={group.joinedFrom ?? ''} onChange={e => set({ joinedFrom: e.target.value || undefined })} /></label>
      <label className="grid gap-2 text-sm">Joined through<input type="date" className={field} value={group.joinedTo ?? ''} onChange={e => set({ joinedTo: e.target.value || undefined })} /></label>
    </div>}
    {value.kind === 'users' && <>
      <AccountSearch selected={labelled} onSelect={toggle} />
      <div className="flex flex-wrap gap-2">{labelled.map(a => <button type="button" key={a.id} className={secondary} onClick={() => toggle(a)}>{a.email} ×</button>)}</div>
      {earlier > 0 && <p className="text-xs text-muted-foreground">{earlier} account{earlier === 1 ? '' : 's'} picked earlier, still included.</p>}
    </>}
    <div className="border-t border-border pt-4 text-sm" aria-live="polite">
      {error ? <p className="text-foreground mark-bad">{error}</p>
        : count ? <><p className="font-medium tabular">{int(count.reachable)} {count.reachable === 1 ? 'person' : 'people'} will get this <span className="font-normal text-muted-foreground">· {int(count.byLocale.en)} English · {int(count.byLocale.vi)} Vietnamese</span></p>
          {count.suppressed > 0 && <p className="mt-1 text-xs text-[var(--console-faint)]">{int(count.suppressed)} more match but unsubscribed or bounced, so they are skipped.</p>}</>
        : <p className="text-muted-foreground">{busy ? 'Counting…' : value.kind === 'users' ? 'Pick accounts to count them.' : 'Counting…'}</p>}
      <p className="mt-2 text-xs text-[var(--console-faint)]">Only confirmed email addresses. Anonymous and deleted accounts are never included.</p>
    </div>
  </div>;
}
