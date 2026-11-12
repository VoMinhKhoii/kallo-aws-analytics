'use client';
import { modelLabel } from '@/lib/traces-ui/graph';
import { UserFilter } from './user-filter';
import { FilterChips } from '@/components/shared/filter-chips';
export function TraceFilters({status,model,flags,models,set,user}:{status:string;model:string;flags:string;models:string[];set:(key:string,value:string)=>void;user:string}) {
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" aria-label="Trace filters">
    <UserFilter value={user} onChange={v=>set('user',v)}/>
    <FilterChips value={status} onChange={v=>set('status',v)} items={[{value:'all',label:'All'},{value:'success',label:'Success'},{value:'error',label:'Error'}]}/>
    <label className="flex h-7 min-w-0 max-w-full items-center gap-2 text-muted-foreground">Model<select aria-label="Model" className="min-w-0 max-w-44 bg-transparent text-foreground outline-none" value={model} onChange={e=>set('model',e.target.value)}><option value="">All</option>{[...new Set([model,...models])].filter(Boolean).map(m=><option key={m} value={m}>{modelLabel(m)}</option>)}</select></label>
    {['chunked','rescue','fallback','retried','unmatched'].map(flag=>{const selected=flags.split(',').includes(flag);return <button key={flag} aria-pressed={selected} onClick={()=>set('flags',(selected?flags.split(',').filter(f=>f!==flag):[...flags.split(',').filter(Boolean),flag]).join(','))} className={`h-7 border-b transition-colors ${selected?'border-[var(--console-accent)] text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>{flag==='unmatched'?'unmatched > 0':flag}</button>;})}
  </div>;
}
