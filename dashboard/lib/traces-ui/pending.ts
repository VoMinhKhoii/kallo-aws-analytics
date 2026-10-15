import type { TraceSummary } from '../traces/types';
import { terminal } from './graph';
/** Refresh each visible pending request, including requests on appended pages. */
export async function refreshPending(rows:TraceSummary[],signal:AbortSignal):Promise<TraceSummary[]> {
  const pending=rows.filter(r=>!terminal(r.status));const updates=new Map<string,TraceSummary>();
  for(let i=0;i<pending.length;i+=4) {
    await Promise.all(pending.slice(i,i+4).map(async row=>{
      const r=await fetch(`/api/traces/${encodeURIComponent(row.id)}?refresh=1`,{signal,cache:'no-store'});const detail=await r.json();if(!r.ok)throw new Error(detail.error??'Live trace update failed');
      const calls=detail.calls as {costUsd:number|null}[];
      const kcal=detail.summary.kcal;
      updates.set(row.id,{...row,status:detail.status,error:detail.errorCode??detail.error,durationMs:detail.durationMs,kcalMid:typeof kcal==='number'?kcal:kcal?.mid??null,items:detail.summary.items.length||row.items,costUsd:calls.length&&calls.every(c=>c.costUsd!=null)?calls.reduce((s,c)=>s+c.costUsd!,0):null});
    }));
  }
  return rows.map(r=>updates.get(r.id)??r);
}
