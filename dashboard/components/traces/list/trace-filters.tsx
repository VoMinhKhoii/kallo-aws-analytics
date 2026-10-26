'use client';
import { modelLabel } from '@/lib/traces-ui/graph';
import { UserFilter } from './user-filter';
export function TraceFilters({status,model,flags,models,set,user}:{status:string;model:string;flags:string;models:string[];set:(key:string,value:string)=>void;user:string}) {
  return <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Trace filters">
    <UserFilter value={user} onChange={v=>set('user',v)}/>
    {['all','success','error'].map(s=><button key={s} aria-pressed={status===s} onClick={()=>set('status',s)} className={`rounded-md border px-4 py-2 ${status===s?'border-foreground bg-secondary':'border-border text-muted-foreground'}`}>{s==='all'?'All':s==='error'?'Error':'Success'}</button>)}
    <label className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border px-2 py-1">Model<select aria-label="Model" className="min-w-0 max-w-44 bg-background py-1" value={model} onChange={e=>set('model',e.target.value)}><option value="">All</option>{[...new Set([model,...models])].filter(Boolean).map(m=><option key={m} value={m}>{modelLabel(m)}</option>)}</select></label>
    {['chunked','rescue','fallback','retried','unmatched'].map(flag=>{const selected=flags.split(',').includes(flag);return <button key={flag} aria-pressed={selected} onClick={()=>set('flags',(selected?flags.split(',').filter(f=>f!==flag):[...flags.split(',').filter(Boolean),flag]).join(','))} className={`rounded-md border px-2 py-2 ${selected?'border-foreground bg-secondary':'border-border text-muted-foreground'}`}>{flag==='unmatched'?'unmatched > 0':flag}</button>;})}
  </div>;
}
