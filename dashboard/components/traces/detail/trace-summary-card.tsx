'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CaretDown, CaretRight, Copy } from '@phosphor-icons/react/ssr';
import { apiFetch } from '@/lib/api-fetch';
import type { Nutrient, TraceGraphDetail, TraceList, TraceSummary } from '@/lib/traces/types';
import { afterResponseText, classifyCall, modelLabel, plural, summaryModels, terminal, utcWhen } from '@/lib/traces-ui/graph';
import { compact, int, ms, usd } from '@/lib/ai-usage/format';
import { StatusBadge } from '../status-badge';

const mid = (v: Nutrient) => v == null ? null : typeof v === 'number' ? v : v.mid;
const range = (v: Nutrient) => v != null && typeof v !== 'number' ? `${int(v.low)}–${int(v.high)}` : null;

/** Recent traces in the same window, so the reader can hop between runs without leaving the canvas. */
function RecentTraces({ id, win }: { id: string; win: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<TraceSummary[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch(`/api/traces?w=${win}&limit=20`, { cache: 'no-store' })
      .then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? 'Recent traces unavailable'); return b as TraceList; })
      .then(b => { if (live) setRows(b.rows); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Recent traces unavailable'); });
    return () => { live = false; };
  }, [win]);
  if (error) return <p role="alert" className="px-4 py-3 text-sm text-foreground mark-bad">{error}</p>;
  if (!rows) return <div role="status" aria-label="Loading recent traces" className="h-40 animate-pulse" />;
  return <div className="max-h-[360px] overflow-auto">
    <table className="w-full min-w-[760px] text-left text-sm">
      <caption className="sr-only">Recent traces</caption>
      <thead className="sticky top-0 bg-popover text-xs text-[var(--console-faint)]"><tr className="border-b border-border">{['', 'Meal', 'Models', 'Status', 'Calls', 'Created', 'Duration'].map((h, i) => <th key={i} className={`py-2 pr-4 font-normal first:pl-4 ${i >= 4 ? 'text-right last:pr-4' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => {
        const on = r.id === id;
        return <tr key={r.id} onClick={() => router.push(`/traces/${r.id}?w=${win}`)} className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-secondary ${on ? 'bg-secondary' : ''}`}>
          <td className="py-2.5 pl-4"><span aria-hidden="true" className={`grid size-3.5 place-items-center rounded-full border ${on ? 'border-[var(--console-accent)]' : 'border-[var(--console-rule-strong)]'}`}>{on && <span className="size-1.5 rounded-full bg-[var(--console-accent)]" />}</span></td>
          <td className="max-w-[280px] py-2.5 pr-4"><Link prefetch={false} href={`/traces/${r.id}?w=${win}`} aria-current={on ? 'page' : undefined} className="block truncate" title={r.rawInput}>{r.rawInput || r.mealName || 'Untitled meal'}</Link><span className="block text-xs text-[var(--console-faint)]">{r.id.slice(0, 8)}</span></td>
          <td className="max-w-[200px] truncate py-2.5 pr-4 text-muted-foreground">{summaryModels(r) || '—'}</td>
          <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
          <td className="tabular py-2.5 pr-4 text-right">{int(r.calls)}</td>
          <td className="py-2.5 pr-4 text-right whitespace-nowrap text-muted-foreground">{utcWhen(r.createdAt)}</td>
          <td className="tabular py-2.5 pr-4 text-right">{ms(r.durationMs)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/** Floating over the canvas: what was asked, what came back, and the run's vital signs. Opens into the meal's items and recent runs. */
export function TraceSummaryCard({ trace: t, win, openItem }: { trace: TraceGraphDetail; win: string; openItem: (item: number) => void }) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  const cost = t.calls.length && t.calls.every(c => c.costUsd != null) ? t.calls.reduce((s, c) => s + c.costUsd!, 0) : null;
  const tokens = t.calls.reduce((s, c) => s + (c.inputTokens ?? 0) + (c.outputTokens ?? 0) + (c.thoughtTokens ?? 0), 0);
  const after = t.calls.filter(c => classifyCall(c, t) === 'afterResponse');
  const partial = !terminal(t.status) || t.completeness.stagesFound < t.completeness.stagesExpected || t.completeness.truncated;
  const kcal = mid(t.summary.kcal), Caret = open ? CaretDown : CaretRight;
  const copy = () => { void navigator.clipboard.writeText(t.id).then(() => setCopied(true)); };
  return <section aria-label="Trace summary" className={`absolute top-4 left-4 z-10 overflow-hidden rounded-[5px] border border-border bg-popover shadow-[0_8px_24px_rgb(0_0_0/0.08)] transition-[width] dark:shadow-[0_8px_24px_rgb(0_0_0/0.6)] ${open ? 'w-[min(1080px,calc(100%-2rem))]' : 'w-[min(640px,calc(100%-2rem))]'}`}>
    <div className="flex items-start gap-3 p-4">
      <button type="button" aria-expanded={open} aria-label={open ? 'Hide items and recent traces' : 'Show items and recent traces'} onClick={() => setOpen(o => !o)} className="mt-1 grid size-6 shrink-0 place-items-center rounded-[3px] text-muted-foreground hover:bg-secondary hover:text-foreground"><Caret className="size-4" /></button>
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">Trace</span>
          <button type="button" onClick={copy} title={`Copy ${t.id}`} className="inline-flex items-center gap-1 font-medium tabular hover:underline">{t.id.slice(0, 8)}<Copy aria-hidden="true" className="size-3.5 text-muted-foreground" />{copied && <span className="text-xs font-normal text-muted-foreground">Copied</span>}</button>
          <StatusBadge status={t.status} />{t.errorCode && <span className="text-xs text-[var(--console-brick)]">{t.errorCode}</span>}
          <span className="text-xs text-muted-foreground">{utcWhen(t.createdAt)} UTC</span>
        </div>
        <h1 className="line-clamp-2 text-lg leading-7 font-medium break-words" title={t.rawInput || t.mealName}>{t.rawInput || t.mealName || 'Meal trace'}</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular text-[22px] leading-7 font-medium tracking-[-0.25px]">{kcal == null ? '—' : int(kcal)}<span className="ml-1 text-sm font-normal text-muted-foreground">kcal</span></span>
          {range(t.summary.kcal) && <span className="tabular text-xs text-[var(--console-faint)]">{range(t.summary.kcal)}</span>}
          <span className="tabular text-sm text-muted-foreground">P {mid(t.summary.protein) == null ? '—' : int(mid(t.summary.protein)!)} g · C {mid(t.summary.carbs) == null ? '—' : int(mid(t.summary.carbs)!)} g · F {mid(t.summary.fat) == null ? '—' : int(mid(t.summary.fat)!)} g</span>
        </div>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{ms(t.durationMs)}</span><span>· {[...new Set(t.calls.map(c => modelLabel(c.model)))].join(' → ') || 'No calls'}</span><span>· {usd(cost)}</span><span>· {compact(tokens)} tokens</span><span>· {plural(t.calls.length, 'attempt')}</span>
          {t.userId && <Link prefetch={false} className="hover:text-foreground hover:underline" href={`/traces?w=${win}&user=${t.userId}`} title={`All traces from user ${t.userId}`}>· user {t.userId.slice(0, 8)}</Link>}
          {t.promptVersions && <span title={Object.entries(t.promptVersions).map(([n, v]) => `${n}: ${v}`).join('\n')}>· prompts {Object.entries(t.promptVersions).map(([n, v]) => <Link prefetch={false} key={n} className="hover:text-foreground hover:underline" href={`/prompts?prompt=${encodeURIComponent(n)}`}>{n}@{v.slice(0, 8)} </Link>)}</span>}
        </p>
        {(partial || after.length > 0) && <p className="text-xs text-muted-foreground mark-warn">{!terminal(t.status) && 'Live · updates every 5 s · '}{partial && `${t.completeness.stagesFound} of ${t.completeness.stagesExpected} stages recorded${t.completeness.truncated ? ' · partial capture' : ''}`}{after.length > 0 && `${partial ? ' · ' : ''}Dropped after response · ${afterResponseText(after, t)}`}</p>}
      </div>
    </div>
    {open && <div className="border-t border-border">
      <div className="px-4 py-3">
        <h2 className="mb-2 text-xs text-[var(--console-faint)]">Items</h2>
        {t.summary.items.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-2">{t.summary.items.map((i, n) => <button key={n} type="button" onClick={() => openItem(n)} title={i.name} className="min-w-0 text-left hover:underline">
          <span className={`block truncate text-sm ${i.matched === false || i.grams === 0 ? 'mark-warn' : ''}`}>{i.name}{i.matched === false && ' · unmatched'}</span>
          <span className="tabular block text-xs text-muted-foreground">{i.grams != null ? `${int(i.grams)} g` : '— g'} · {i.grams === 0 || mid(i.kcal) == null ? '—' : int(mid(i.kcal)!)} kcal</span>
        </button>)}</div> : <p className="text-sm text-muted-foreground">Meal items not recorded</p>}
      </div>
      <div className="border-t border-border"><h2 className="px-4 pt-3 pb-1 text-xs text-[var(--console-faint)]">Recent traces</h2><RecentTraces id={t.id} win={win} /></div>
    </div>}
  </section>;
}
