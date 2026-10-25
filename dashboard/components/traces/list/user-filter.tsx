'use client';
import { useState } from 'react';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One account's traces: paste its user ID; the chip clears it. */
export function UserFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState('');
  if (uuid.test(value)) return <button type="button" aria-label={`Clear user filter ${value}`} onClick={() => onChange('')} className="rounded-md border border-foreground bg-secondary px-4 py-2 font-mono">User {value.slice(0, 8)}… ×</button>;
  const invalid = draft.trim() !== '' && !uuid.test(draft.trim());
  return <form className="flex items-center" onSubmit={e => { e.preventDefault(); if (uuid.test(draft.trim())) { onChange(draft.trim().toLowerCase()); setDraft(''); } }}>
    <label className="sr-only" htmlFor="trace-user">User ID</label>
    <input id="trace-user" value={draft} onChange={e => setDraft(e.target.value)} placeholder="User ID" aria-invalid={invalid} spellCheck={false}
      className={`w-40 rounded-md border bg-background px-2 py-2 font-mono ${invalid ? 'border-[var(--console-brick)]' : 'border-border'}`} />
  </form>;
}
