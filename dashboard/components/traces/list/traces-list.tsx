'use client';
import { apiFetch } from '@/lib/api-fetch';
import { plural } from '@/lib/traces-ui/graph';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUrlState } from '@/lib/use-url-state';
import type { TraceList,TraceSummary } from '@/lib/traces/types';
import { refreshPending, pendingEligible } from '@/lib/traces-ui/pending';
import { useRefocus } from '@/lib/use-refocus';
import { PageHeader } from '@/components/shared/page-header';
import { ms } from '@/lib/ai-usage/format';
import { TraceFilters } from './trace-filters';
import { TraceRow } from './trace-row';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default function TracesList() {
  const router=useRouter();const [win,setWin,ready]=useUrlState('w','24h',['24h','7d','30d']);
  const [q,setQ]=useUrlState('q','');const [status,setStatus]=useUrlState('status','all',['all','success','error','pending']);
  const [model,setModel]=useUrlState('model','');const [flags,setFlags]=useUrlState('flags','');const [user,setUser]=useUrlState('user','');const [request]=useUrlState('request','');
  const [draft,setDraft]=useState<string>(q),[rows,setRows]=useState<TraceSummary[]>([]),[next,setNext]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[active,setActive]=useState(-1),[version,setVersion]=useState(0);
  const [more,setMore]=useState(false),[models,setModels]=useState<string[]>([]);const search=useRef<HTMLInputElement>(null);const generation=useRef(0);const abort=useRef<AbortController|null>(null);
  const rowsRef=useRef(rows);rowsRef.current=rows;const previousQuery=useRef('');
  useRefocus(()=>setVersion(v=>v+1));
  const query=new URLSearchParams({w:win,q,status,model,flags,...(uuid.test(user)?{user}:{}),limit:'25'}).toString();
  useEffect(()=>setDraft(q),[q]);
  useEffect(()=>{if(ready&&uuid.test(request))router.replace(`/traces/${request}?w=${win}`);},[ready,request,router,win]);
  useEffect(()=>{
    if(!ready)return;const g=++generation.current;const controller=new AbortController();abort.current=controller;let timer:ReturnType<typeof setTimeout>;let failures=0;
    if(previousQuery.current!==query){setRows([]);setNext(null);setActive(-1);previousQuery.current=query;}
    const load=async()=>{
      setLoading(true);setError('');
      try{const r=await apiFetch(`/api/traces?${query}${version?'&refresh=1':''}`,{signal:controller.signal,cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error??'Traces unavailable');if(g!==generation.current)return;
        const data=b as TraceList;
        setRows(data.rows);setNext(data.next);
        setModels(old=>[...new Set([...old,...data.rows.map(r=>r.modelCall2).filter((m):m is string=>!!m)])]);
        timer=setTimeout(live,5000);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Traces unavailable');}finally{if(!controller.signal.aborted)setLoading(false);}
    };
    const live=async()=>{
      if(document.hidden){timer=setTimeout(live,5000);return;}
      try {
        if(rowsRef.current.some(r=>pendingEligible(r))){
          const snapshot=rowsRef.current;
          const updates=await refreshPending(snapshot,controller.signal,Date.now(),query);
          failures=updates.failed?failures+1:0;
          if(g===generation.current){const ids=new Set(updates.rows.map(r=>r.id));setRows(old=>old.filter(r=>!snapshot.some(o=>o.id===r.id)||ids.has(r.id)).map(r=>updates.rows.find(u=>u.id===r.id)??r));}
          if(updates.failed)setError('Some live updates failed; retrying with backoff.');
        }
      }catch(e){failures++;if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Live update failed');}
      finally{if(!controller.signal.aborted)timer=setTimeout(live,Math.min(60000,5000*2**Math.min(failures,4)));}
    };
    void load();return()=>{controller.abort();clearTimeout(timer);};
  },[query,version,ready]);
  const loadMore=async()=>{if(!next||more)return;const g=generation.current;setMore(true);setError('');try{const r=await apiFetch(`/api/traces?${query}&cursor=${encodeURIComponent(next)}`,{signal:abort.current?.signal});const b=await r.json();if(!r.ok)throw new Error(b.error??'Unable to load more');if(g!==generation.current)return;setRows(old=>[...old,...(b as TraceList).rows.filter(r=>!old.some(o=>o.id===r.id))]);setNext(b.next);}catch(e){if(g===generation.current)setError(e instanceof Error?e.message:'Unable to load more');}finally{setMore(false);}};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.metaKey||e.ctrlKey||e.altKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return;
    if(e.key==='/'){e.preventDefault();search.current?.focus();}if(e.key==='j'||e.key==='k'){e.preventDefault();setActive(i=>Math.max(0,Math.min(rows.length-1,i+(e.key==='j'?1:-1))));}
    if(e.key==='Enter'&&rows[active])router.push(`/traces/${rows[active].id}?w=${win}`);if(e.key==='c'&&rows[active])void navigator.clipboard.writeText(rows[active].id);
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,rows,router,win]);
  useEffect(()=>{if(active>=0)document.querySelector(`[data-trace-id="${rows[active]?.id}"]`)?.scrollIntoView({block:'nearest'});},[active,rows]);
  const set=(key:string,value:string)=>{const setters:Record<string,(v:string)=>void>={status:setStatus,model:setModel,flags:setFlags,user:setUser};setters[key]?.(value);};
  // The line under the title: what the loaded rows say, so it never claims more than is shown.
  const timed=rows.map(r=>r.durationMs).filter((v):v is number=>v!=null).sort((x,y)=>x-y);const failed=rows.filter(r=>r.status==='error').length;
  const summary=rows.length?`${plural(rows.length,'meal')}${next?' loaded':''} ${win==='24h'?'in the last 24 hours':`in the last ${win.replace('d','')} days`}: ${failed?`${failed} failed`:'none failed'}${timed.length?`, median ${ms((timed[Math.floor((timed.length-1)/2)]+timed[Math.ceil((timed.length-1)/2)])/2)}, slowest ${ms(timed.at(-1))}`:''}.`:undefined;
  return <div className="mx-auto grid w-full min-w-0 max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-4 py-4"><PageHeader title="Traces" description={summary} window={win} onWindow={setWin} refreshing={loading} onRefresh={()=>setVersion(v=>v+1)}/>
    <form className="relative" onSubmit={e=>{e.preventDefault();if(uuid.test(draft.trim()))router.push(`/traces/${draft.trim()}?w=${win}`);else setQ(draft.trim());}}><input ref={search} aria-label="Search meal text or request UUID" placeholder="Search meal text or request UUID…" maxLength={160} value={draft} onChange={e=>setDraft(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background pl-4 pr-6 text-sm"/><kbd className="pointer-events-none absolute right-3 top-2.5 rounded border border-border px-2 text-xs text-muted-foreground">/</kbd></form>
    <TraceFilters {...{status,model,flags,models,set,user}}/>
    <p aria-live="polite" className="text-xs text-muted-foreground">{loading&&!rows.length?'Loading traces…':rows.length?`${rows.length} shown`:plural(0,'trace')}{next&&<> · <button disabled={more} onClick={loadMore} className="underline">{more?'Loading…':'Load more'}</button></>}{rows.some(r=>pendingEligible(r))&&' · Live'}</p>
    {error&&<p role="alert" className="text-sm text-foreground mark-bad">{error} <button onClick={()=>setVersion(v=>v+1)} className="underline">Retry</button></p>}
    <div aria-label="Meal traces">{!ready||loading&&!rows.length?Array.from({length:10},(_,i)=><div key={i} className="h-14 animate-pulse border-b border-border bg-secondary/30"/>):rows.map((row,i)=><TraceRow key={row.id} row={row} active={i===active} win={win}/>)}</div>
    {!loading&&!rows.length&&!error&&<p className="py-6 text-center text-sm text-muted-foreground">No meals match these filters.</p>}
  </div>;
}
