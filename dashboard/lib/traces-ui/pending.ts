import type { TraceSummary } from '../traces/types';
import type { TraceStatus } from '../traces/status';
import { terminal } from './graph';
export const pendingAgeMs = 10 * 60 * 1000;
export const pendingEligible = (row: Pick<TraceSummary,'status'|'createdAt'>, now=Date.now()) => !terminal(row.status) && Number.isFinite(Date.parse(row.createdAt)) && now-Date.parse(row.createdAt)<pendingAgeMs;
/** Independent batches preserve successful per-row updates, even if another batch fails. */
export async function refreshPending(rows:TraceSummary[],signal:AbortSignal,now=Date.now()):Promise<{rows:TraceSummary[]; failed:boolean}> {
  const pending=rows.filter(r=>pendingEligible(r,now)), updates=new Map<string,TraceStatus>(), missing=new Set<string>();
  const batches=Array.from({length:Math.ceil(pending.length/50)},(_,i)=>pending.slice(i*50,(i+1)*50));
  const results=await Promise.allSettled(batches.map(async batch=>{
    const response=await fetch(`/api/traces/status?ids=${batch.map(r=>encodeURIComponent(r.id)).join(',')}`,{signal,cache:'no-store'});
    if(response.status===404){batch.forEach(r=>missing.add(r.id));return;}
    const body=await response.json();if(!response.ok)throw new Error(body.error??'Live update failed');
    for(const row of body.rows as TraceStatus[])if(batch.some(r=>r.id===row.id))updates.set(row.id,row);
    for(const id of body.missing as string[])if(batch.some(r=>r.id===id))missing.add(id);
  }));
  return {rows:rows.filter(r=>!missing.has(r.id)).map(r=>updates.has(r.id)?{...r,...updates.get(r.id)}:r),failed:results.some(r=>r.status==='rejected')};
}
