'use client';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react/ssr';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Step } from '@/lib/traces-ui/graph';
import { modelLabel, plural } from '@/lib/traces-ui/graph';
import type { TraceGraphDetail, TracePayload } from '@/lib/traces/types';
import { useResource } from '@/lib/traces-ui/use-resource';
import { useUrlState } from '@/lib/use-url-state';
import { tokenText } from '@/lib/traces-ui/format';
import { int, ms, usd } from '@/lib/ai-usage/format';
import { StatusBadge } from '../status-badge';
import { CallList } from './call-list';
import { PayloadSummary } from './payload-summary';
import PayloadView from './payload-view';

const TYPE: Record<string, string> = { request: 'Request', stage: 'Stage', ghost: 'Stage', attempt: 'Call', chunk: 'Call', selector: 'Selector', rescue: 'Rescue', gap: 'Gap', 'after-response': 'After response', unattributed: 'Unattributed', response: 'Response' };
const LABELS: Record<string, string> = { ingredientCount: 'Ingredients', matchedCount: 'Matched', unmatchedCount: 'Unmatched', mealItemCount: 'Items', itemCount: 'Items', chunkCount: 'Chunks', failedChunkCount: 'Failed chunks', isFood: 'Is food', mealSlot: 'Meal slot' };
const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="border-t border-border px-6 py-5"><div className="mb-3 flex items-center justify-between gap-4"><h3 className="text-base font-medium">{title}</h3>{action}</div>{children}</section>;
}

/** One step in full: the facts that matter first, then every field, then the raw input and output. */
export function StepModal({ trace, step, parent, close, navigate }: { trace: TraceGraphDetail; step: Step; parent: Step | undefined; close: () => void; navigate: (direction: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal(); return () => d?.close(); }, []);
  const [item] = useUrlState('item', '');
  const calls = trace.calls.filter(c => step.calls.includes(c.id));
  const responseStep = step.kind === 'response';
  const key = responseStep ? trace.stages.find(s => s.name === 'assembly')?.key : step.payloadKey;
  const stage = trace.stages.find(s => s.key === key);
  const payload = useResource<TracePayload>(key ? `/api/traces/${encodeURIComponent(trace.id)}/payload?node=${encodeURIComponent(key)}&source=${trace.source}&kind=stage` : null);
  const related = (name: string) => step.id === 'matching' ? trace.stages.find(s => s.name === name)?.key : undefined;
  const relatedUrl = (name: string) => related(name) ? `/api/traces/${encodeURIComponent(trace.id)}/payload?node=${encodeURIComponent(related(name)!)}&source=${trace.source}&kind=stage` : null;
  const assembly = useResource<TracePayload>(relatedUrl('assembly')), decomposition = useResource<TracePayload>(relatedUrl('decomposition'));
  const body = key ? payload.data : null;
  const call = calls.find(c => c.id === key);
  const error = call?.error ?? step.error ?? calls.find(c => c.error)?.error;
  const input = body && ('input' in body ? body.input : body.prompt), rawOutput = body && ('output' in body ? body.output : body.response);
  const output = responseStep ? { status: trace.status, error: trace.error, durationMs: trace.durationMs, ...(rawOutput && typeof rawOutput === 'object' && 'result' in rawOutput ? { result: rawOutput.result } : {}) } : rawOutput;
  const group = calls.length > 0 && !step.payloadKey;
  const sum = (k: 'inputTokens' | 'cachedTokens' | 'outputTokens') => calls.length && calls.every(c => c[k] !== null) ? calls.reduce((n, c) => n + (c[k] ?? 0), 0) : null;
  const started = step.timingKnown === false ? null : new Date(Date.parse(trace.createdAt) + step.start);
  const download = () => { const blob = new Blob([JSON.stringify({ step, metadata: call ?? step, payload: body }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${trace.id}-${step.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const status = step.kind === 'ghost' ? 'missing' : step.afterResponse ? 'dropped' : step.status;
  const fields: [string, ReactNode][] = [
    ['Step id', <span key="id" className="tabular break-all">{key ?? step.id}</span>],
    ['Type', TYPE[step.kind] ?? step.kind],
    ['Status', <StatusBadge key="s" status={status} />],
    ['Model', unique(calls.map(c => modelLabel(c.model))).join(' → ') || '—'],
    ['Attempts', calls.length ? `${plural(calls.length, 'call')}${Math.max(...calls.map(c => c.attempt)) > 1 ? ` · up to attempt ${Math.max(...calls.map(c => c.attempt))}` : ''}` : '—'],
    ['Started', started ? `+${ms(step.start)} · ${started.toISOString().slice(11, 19)} UTC` : 'Not recorded'],
    ['Duration', step.duration != null ? ms(step.duration) : '—'],
    ['Tokens', calls.length ? tokenText({ inputTokens: sum('inputTokens'), cachedTokens: sum('cachedTokens'), outputTokens: sum('outputTokens') }) : '—'],
    ['Cost', usd(step.cost)],
    ['Prompt version', unique(calls.map(c => c.promptVersionId)).join(', ') || '—'],
    ['Parent', parent?.name ?? '—'],
    ['Captured', stage ? `${stage.inputBytes?.toLocaleString('en-US') ?? '—'} → ${stage.outputBytes?.toLocaleString('en-US') ?? '—'} B` : '—'],
  ];
  const loading = <div role="status" aria-label="Loading payload" className="h-24 animate-pulse rounded-[5px] bg-[var(--console-surface)]" />;
  const payloadError = <p role="alert" className="text-sm text-foreground mark-bad">{payload.error} <button onClick={payload.refresh} className="underline">Retry</button></p>;
  return <dialog ref={dialog} aria-label={`${step.name} step details`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}
    className="m-auto max-h-[92vh] w-[min(1120px,94vw)] overflow-hidden rounded-[5px] border border-border bg-popover p-0 text-foreground shadow-[0_16px_48px_rgb(0_0_0/0.18)] backdrop:bg-black/40">
    <div className="flex max-h-[92vh] flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-4">
        <h2 className="text-lg font-medium">{step.name}</h2>
        <span className="inline-flex h-5 items-center rounded-[3px] border border-border px-1.5 text-xs text-muted-foreground">{TYPE[step.kind] ?? step.kind}</span>
        <StatusBadge status={status} />
        <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 hover:text-foreground" title="Previous step ( [ )"><CaretLeft aria-hidden="true" className="size-3.5" />Prev</button>
          <button type="button" onClick={() => navigate(1)} className="inline-flex items-center gap-1 hover:text-foreground" title="Next step ( ] )">Next<CaretRight aria-hidden="true" className="size-3.5" /></button>
          <button type="button" autoFocus onClick={close} aria-label="Close step details" className="grid size-8 place-items-center rounded-[5px] hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto">
        <section aria-label="Key facts" className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <div className="grid content-start gap-1"><span className="text-xs text-[var(--console-faint)]">User input</span><p className="text-base leading-6 break-words">{trace.rawInput || trace.mealName || 'Not recorded'}</p></div>
          <div className="grid content-start gap-1"><span className="text-xs text-[var(--console-faint)]">{responseStep ? 'Result' : 'This step produced'}</span>
            <p className="text-base leading-6 break-words">{step.afterResponse ? `${step.count} · result dropped` : step.count || 'Nothing recorded'}{step.warning && <span className="text-[var(--console-amber)]">{step.warning}</span>}</p>
            {stage && Object.keys(stage.stats).length > 0 && <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">{Object.entries(stage.stats).map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-muted-foreground">{LABELS[k] ?? k}</dt><dd className="tabular">{v ?? '—'}</dd></div>)}</dl>}
            {step.id === 'assembly' && item !== '' && trace.summary.items[Number(item)] && <p className="text-sm">Selected item {Number(item) + 1}: {trace.summary.items[Number(item)].name}</p>}
          </div>
          {error && <div className="rounded-[5px] border px-4 py-3 text-sm md:col-span-2" style={{ borderColor: 'color-mix(in oklab, var(--console-brick) 40%, var(--console-rule))', background: 'color-mix(in oklab, var(--console-brick) 8%, transparent)' }}><p className="mb-1 text-xs text-[var(--console-brick)]">Error</p><p className="whitespace-pre-wrap break-words">{error}</p><button type="button" onClick={() => void navigator.clipboard.writeText(error)} className="mt-2 text-xs text-muted-foreground underline">Copy error</button></div>}
          {(step.id === 'matching' || step.id === 'decomposition' || step.id === 'assembly' || step.id === 'nutrition') && <div className="text-sm md:col-span-2">
            {payload.loading || assembly.loading || decomposition.loading ? loading : payload.error ? payloadError : <PayloadSummary payload={body} stage={step.id} trace={trace} assembly={assembly.data} decomposition={decomposition.data} />}
            {(assembly.error || decomposition.error) && <p className="mt-2 text-muted-foreground mark-warn">Related stage unavailable; some choices may be missing. <button className="underline" onClick={() => { assembly.refresh(); decomposition.refresh(); }}>Retry</button></p>}
          </div>}
          {responseStep && <p className="tabular text-sm text-muted-foreground md:col-span-2">{trace.summary.kcal == null ? 'No kcal recorded' : `${int(typeof trace.summary.kcal === 'number' ? trace.summary.kcal : trace.summary.kcal.mid)} kcal`} · {plural(trace.summary.items.length, 'item')}</p>}
        </section>
        <Section title="Details">
          <dl className="grid overflow-hidden rounded-[5px] border border-border text-sm md:grid-cols-2">{fields.map(([k, v]) => <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-border md:odd:border-r [&:nth-last-child(-n+2)]:md:border-b-0 last:border-b-0">
            <dt className="bg-[var(--console-surface)] px-4 py-2.5 text-muted-foreground">{k}</dt><dd className="min-w-0 px-4 py-2.5 break-words">{v}</dd>
          </div>)}</dl>
        </Section>
        {calls.length > 0 && <Section title="Calls"><div className="text-sm"><CallList trace={trace} calls={calls} /></div></Section>}
        {!group && <>
          <Section title={body && 'promptIsTemplate' in body && body.promptIsTemplate ? 'Input · prompt template (exact request not recorded)' : 'Input'} action={<button type="button" disabled={!!key && payload.loading} onClick={download} className="text-xs text-muted-foreground underline disabled:opacity-50">Download JSON</button>}>
            {key && payload.loading && !body ? loading : key && payload.error ? payloadError : <PayloadView value={key && !responseStep ? input : step.kind === 'request' ? { rawInput: trace.rawInput, profile: trace.profile } : null} absent={call ? 'Prompt text not recorded for this call' : 'Input not recorded for this step'} />}
          </Section>
          <Section title="Output">
            {key && payload.loading && !body ? loading : key && payload.error ? payloadError : <PayloadView value={key || responseStep ? output : null} absent={call ? 'Response text not recorded for this call' : 'Output not recorded for this step'} />}
          </Section>
        </>}
      </div>
    </div>
  </dialog>;
}
