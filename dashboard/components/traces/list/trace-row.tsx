import { plural, summaryModels, utcWhen } from '@/lib/traces-ui/graph';
import Link from 'next/link';
import type { TraceSummary } from '@/lib/traces/types';
import { int, ms } from '@/lib/ai-usage/format';
import { StatusBadge } from '../status-badge';
export const TRACE_COLS='grid grid-cols-[minmax(0,1fr)_96px_64px] items-center gap-x-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_96px_48px_112px_72px_64px]';
export function TraceHeader() {
  return <div role="row" className={`${TRACE_COLS} h-9 border-b border-border text-xs text-[var(--console-faint)]`}>
    <span role="columnheader">Meal</span><span role="columnheader" className="hidden md:block">Context</span><span role="columnheader">Status</span>
    <span role="columnheader" className="hidden text-right md:block">Calls</span><span role="columnheader" className="hidden text-right md:block">Created</span>
    <span role="columnheader" className="hidden text-right md:block">Duration</span><span role="columnheader" className="text-right">kcal</span>
  </div>;
}
/** One run as a table row: what was typed, how it was handled, how it ended. */
export function TraceRow({row:r,active,win}:{row:TraceSummary;active:boolean;win:string}) {
  const flags=[r.chunkCount>1&&`chunked ×${r.chunkCount}`,r.rescueCount>0&&`rescue ×${r.rescueCount}`,r.fallbacks>0&&'fallback',r.retries>0&&'retried',r.unmatched>0&&`unmatched ${r.unmatched}`].filter(Boolean) as string[];
  const context=[summaryModels(r)||'Model not recorded',r.items==null?'items not recorded':plural(r.items,'item'),plural(r.ingredients,'ingredient')];
  return <Link prefetch={false} role="row" data-trace-id={r.id} aria-current={active?'true':undefined} href={`/traces/${r.id}?w=${win}`} className={`${TRACE_COLS} min-h-16 border-b border-border py-3 text-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-accent)] ${active?'bg-secondary':''}`}>
    <span role="cell" className="grid min-w-0"><span title={r.rawInput} className="truncate">{r.rawInput||r.mealName||'Untitled meal'}</span><span className="truncate text-xs text-[var(--console-faint)]">{r.id.slice(0,8)}{(r.errorCode||r.error)&&<span className="text-[var(--console-brick)]"> · {r.errorCode??r.error}</span>}</span></span>
    <span role="cell" className="hidden min-w-0 text-xs leading-5 text-muted-foreground md:block" title={[...context,...flags].join(' · ')}><span className="line-clamp-2">{context.join(' · ')}{flags.length>0&&<span className="text-[var(--console-amber)]"> · {flags.join(' · ')}</span>}</span></span>
    <span role="cell"><StatusBadge status={r.status}/></span>
    <span role="cell" className="tabular hidden text-right md:block">{int(r.calls)}</span>
    <span role="cell" className="hidden text-right whitespace-nowrap text-muted-foreground md:block">{utcWhen(r.createdAt)}</span>
    <span role="cell" className="tabular hidden text-right md:block">{ms(r.durationMs)}</span>
    <span role="cell" className="tabular text-right">{r.status==='error'||r.kcalMid==null?'—':int(r.kcalMid)}</span>
  </Link>;
}
