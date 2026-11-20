'use client';
import { CaretDown, CaretRight } from '@phosphor-icons/react/ssr';
import { useState } from 'react';

type Kind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';
const kind = (v: unknown): Kind => v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'number' || typeof v === 'bigint' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
const LONG = 2000, PAGE = 50;

function Key({ name }: { name: string | null }) {
  return name === null ? null : <span className="shrink-0 text-foreground">&quot;{name}&quot;<span className="text-[var(--console-faint)]"> :</span></span>;
}

function Leaf({ name, value }: { name: string | null; value: unknown }) {
  const k = kind(value);
  const [full, setFull] = useState(false);
  const text = k === 'string' ? String(value) : k === 'null' ? 'null' : String(value);
  const cut = k === 'string' && text.length > LONG && !full;
  return <div className="flex min-w-0 items-baseline gap-2 py-0.5">
    <Key name={name} />
    <span className="shrink-0 text-xs text-[var(--console-faint)]">{k}</span>
    <span className={`min-w-0 break-words whitespace-pre-wrap ${k === 'string' ? 'text-[var(--console-accent)]' : k === 'null' ? 'text-[var(--console-faint)]' : 'text-foreground'}`}>
      {k === 'string' ? `"${cut ? text.slice(0, LONG) + '…' : text}"` : text}
      {cut && <button type="button" className="ml-2 text-xs text-muted-foreground underline" onClick={() => setFull(true)}>Show all {text.length.toLocaleString('en-US')} characters</button>}
    </span>
  </div>;
}

function Branch({ name, value, depth, openDepth }: { name: string | null; value: object; depth: number; openDepth: number }) {
  const array = Array.isArray(value);
  const entries = Object.entries(value);
  const [open, setOpen] = useState(depth < openDepth);
  const [limit, setLimit] = useState(PAGE);
  const Caret = open ? CaretDown : CaretRight;
  return <div className="min-w-0">
    <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex min-w-0 items-baseline gap-2 py-0.5 text-left">
      <Caret aria-hidden="true" className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" />
      <Key name={name} />
      <span className="text-muted-foreground">{array ? '[' : '{'}</span>
      <span className="text-xs text-[var(--console-faint)]">{entries.length} {entries.length === 1 ? 'item' : 'items'}</span>
      {!open && <span className="text-muted-foreground">{array ? ']' : '}'}</span>}
    </button>
    {open && <>
      <div className="ml-1.5 border-l border-border pl-4">
        {entries.slice(0, limit).map(([k, v]) => <Node key={k} name={array ? null : k} index={array ? Number(k) : undefined} value={v} depth={depth + 1} openDepth={openDepth} />)}
        {limit < entries.length && <button type="button" className="py-1 text-xs text-muted-foreground underline" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, entries.length - limit)} more of {entries.length - limit}</button>}
      </div>
      <span className="pl-5 text-muted-foreground">{array ? ']' : '}'}</span>
    </>}
  </div>;
}

function Node({ name, index, value, depth, openDepth }: { name: string | null; index?: number; value: unknown; depth: number; openDepth: number }) {
  const label = name ?? (index !== undefined ? String(index) : null);
  const k = kind(value);
  return k === 'array' || k === 'object' ? <Branch name={label} value={value as object} depth={depth} openDepth={openDepth} /> : <Leaf name={label} value={value} />;
}

/** The whole payload as a tree: keys, a type label for each value, and long text wrapped so it can be read in place. */
export function JsonView({ value }: { value: unknown }) {
  const [mode, setMode] = useState({ depth: 3, gen: 0 });
  const [copied, setCopied] = useState(false);
  return <div className="min-w-0 text-[13px] leading-6">
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <button type="button" className="hover:text-foreground" onClick={() => setMode(m => ({ depth: 99, gen: m.gen + 1 }))}>Expand all</button>
      <button type="button" className="hover:text-foreground" onClick={() => setMode(m => ({ depth: 1, gen: m.gen + 1 }))}>Collapse all</button>
      <button type="button" className="hover:text-foreground" onClick={() => void navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null').then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy JSON'}</button>
    </div>
    <div className="max-h-[560px] overflow-auto rounded-[5px] border border-border bg-[var(--console-surface)] px-4 py-3">
      <Node key={mode.gen} name="root" value={value} depth={0} openDepth={mode.depth} />
    </div>
  </div>;
}
