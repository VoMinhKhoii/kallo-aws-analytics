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
import { TraceFilters } from './trace-filters';
import { TraceHeader, TraceRow } from './trace-row';
import { MagnifyingGlass } from '@phosphor-icons/react/ssr';
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
  return <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-6"><PageHeader title="Traces" window={win} onWindow={setWin} refreshing={loading} onRefresh={()=>setVersion(v=>v+1)}/>
    <form className="relative" onSubmit={e=>{e.preventDefault();if(uuid.test(draft.trim()))router.push(`/traces/${draft.trim()}?w=${win}`);else setQ(draft.trim());}}><input ref={search} aria-label="Search meal text or request UUID" placeholder="Search meals or paste a request ID" maxLength={160} value={draft} onChange={e=>setDraft(e.target.value)} className="h-10 w-full border-b border-input bg-transparent pr-10 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-[var(--console-accent)]"/><MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute top-3 left-0 size-4 text-muted-foreground"/><kbd className="pointer-events-none absolute top-2.5 right-0 inline-flex h-5 items-center rounded-[3px] border border-input px-1.5 font-sans text-xs text-[var(--console-faint)]">/</kbd></form>
    <TraceFilters {...{status,model,flags,models,set,user}}/>
    <p aria-live="polite" className="text-xs text-muted-foreground">{loading&&!rows.length?'Loading traces…':rows.length?`${rows.length} shown`:plural(0,'trace')}{next&&<> · <button disabled={more} onClick={loadMore} className="underline">{more?'Loading…':'Load more'}</button></>}{rows.some(r=>pendingEligible(r))&&' · Live'}</p>
    {error&&<p role="alert" className="text-sm text-foreground mark-bad">{error} <button onClick={()=>setVersion(v=>v+1)} className="underline">Retry</button></p>}
    <div role="table" aria-label="Meal traces" className="border-t border-border"><TraceHeader/>{!ready||loading&&!rows.length?Array.from({length:10},(_,i)=><div key={i} className="h-16 animate-pulse border-b border-border"/>):rows.map((row,i)=><TraceRow key={row.id} row={row} active={i===active} win={win}/>)}</div>
    {!loading&&!rows.length&&!error&&<p className="py-6 text-center text-sm text-muted-foreground">No meals match these filters.</p>}
  </div>;
}
