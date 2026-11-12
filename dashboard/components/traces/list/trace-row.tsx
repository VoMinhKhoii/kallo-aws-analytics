import { modelLabel, plural } from '@/lib/traces-ui/graph';
import Link from 'next/link';
import type { TraceSummary } from '@/lib/traces/types';
import { int, ms, usd } from '@/lib/ai-usage/format';
import { StatusDot } from '../status-dot';
/** `brief` drops the id, clock time and pipeline flags for summary lists; the Traces page keeps them. */
export function TraceRow({row:r,active,win,brief=false}:{row:TraceSummary;active:boolean;win:string;brief?:boolean}) {
  const age=Math.max(0,(Date.now()-Date.parse(r.createdAt))/60000);
  const flags=brief?[]:[r.chunkCount>1&&`chunked ×${r.chunkCount}`,r.rescueCount>0&&`rescue ×${r.rescueCount}`,r.fallbacks>0&&'fallback',r.retries>0&&'retried',r.unmatched>0&&`unmatched ${r.unmatched}`].filter(Boolean);
  const model=[r.modelCall1,r.modelCall2].filter((x,i,a)=>x&&a.indexOf(x)===i).map(m=>modelLabel(m!)).join(' → ')||r.models.map(modelLabel).join(', ')||'Model not recorded';
  return <Link data-trace-id={r.id} aria-current={active?'true':undefined} href={`/traces/${r.id}?w=${win}`} className={`block min-h-14 min-w-0 border-b border-border px-4 py-2 hover:bg-secondary focus-visible:outline-2 ${active?'bg-secondary':''}`}>
    <div className="flex items-center gap-2 text-sm"><StatusDot status={r.status}/><span title={r.rawInput} className="min-w-0 flex-1 truncate">{r.rawInput||r.mealName||'Untitled meal'}</span><span className="tabular shrink-0">{ms(r.durationMs)}</span><span className="tabular w-20 shrink-0 text-right">{r.status==='error'?'—':r.kcalMid==null?'—':int(r.kcalMid)}<span className="ml-1 text-xs text-muted-foreground">kcal</span></span></div>
    <div className="mt-1 break-words text-xs text-muted-foreground sm:truncate" title={[r.errorCode??r.error,...flags,model].filter(Boolean).join(' · ')}>{(r.errorCode||r.error)&&<span className="text-[var(--console-brick)]">{r.errorCode??r.error} · </span>}{flags.length>0&&`${flags.join(' · ')} · `}{model} · {r.items==null?'Items not recorded':plural(r.items,'item')}{!brief&&<> · {plural(r.ingredients,'ingredient')}</>} · {usd(r.costUsd)}{!brief&&<> · {r.id.slice(0,8)} · {new Date(r.createdAt).toISOString().slice(11,19)} UTC</>} · {age<1?'just now':age<60?`${Math.floor(age)} min ago`:`${Math.floor(age/60)} h ago`}</div>
  </Link>;
}
