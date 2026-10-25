'use client';
import { useMemo } from 'react';
import { lineDiff, MAX_DIFF_LINES } from '@/lib/prompts/line-diff';

const MARK = { added: '+', removed: '−', same: ' ' } as const;
const TONE = { added: 'bg-[color-mix(in_srgb,var(--console-green)_14%,transparent)]', removed: 'bg-[color-mix(in_srgb,var(--console-brick)_14%,transparent)]', same: '' } as const;

/** Template sample `before` → `after`, line by line; unchanged runs stay visible for context. */
export function VersionDiff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  if (!lines) return <p className="py-4 text-sm text-muted-foreground">A template is over {MAX_DIFF_LINES.toLocaleString('en-GB')} lines; compare the samples below instead.</p>;
  const added = lines.filter(l => l.kind === 'added').length, removed = lines.filter(l => l.kind === 'removed').length;
  return <div className="grid gap-2">
    <p className="text-xs text-muted-foreground">{added ? `${added} line${added === 1 ? '' : 's'} added` : 'No lines added'} · {removed ? `${removed} removed` : 'none removed'}</p>
    <pre className="max-h-[640px] overflow-auto rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] py-2 text-xs leading-5">{lines.map((l, i) =>
      <div key={i} className={`flex px-4 ${TONE[l.kind]}`}><span aria-hidden className="w-4 shrink-0 select-none text-muted-foreground">{MARK[l.kind]}</span><span className="sr-only">{l.kind === 'same' ? '' : l.kind + ': '}</span><span className="whitespace-pre-wrap break-words">{l.text || ' '}</span></div>)}</pre>
  </div>;
}
