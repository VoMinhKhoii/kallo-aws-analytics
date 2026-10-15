'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUrlState } from '@/lib/use-url-state';
import type { TraceList,TraceSummary } from '@/lib/traces/types';
import { refreshPending } from '@/lib/traces-ui/pending';
import { useRefocus } from '@/lib/use-refocus';
import { terminal } from '@/lib/traces-ui/graph';
import { RefreshButton } from '@/components/console/console';
import { TraceFilters } from './trace-filters';
import { TraceRow } from './trace-row';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default function TracesList() {
  const router=useRouter();const [win,setWin,ready]=useUrlState('w','24h',['24h','7d','30d']);
  const [q,setQ]=useUrlState('q','');const [status,setStatus]=useUrlState('status','all',['all','success','error','pending']);
  const [model,setModel]=useUrlState('model','');const [flags,setFlags]=useUrlState('flags','');const [request]=useUrlState('request','');
  const [draft,setDraft]=useState<string>(q),[rows,setRows]=useState<TraceSummary[]>([]),[next,setNext]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[active,setActive]=useState(-1),[version,setVersion]=useState(0);
  const [more,setMore]=useState(false),[models,setModels]=useState<string[]>([]);const search=useRef<HTMLInputElement>(null);const generation=useRef(0);const abort=useRef<AbortController|null>(null);
  const rowsRef=useRef(rows);rowsRef.current=rows;const previousQuery=useRef('');
  useRefocus(()=>setVersion(v=>v+1));
  const query=new URLSearchParams({w:win,q,status,model,flags,limit:'25'}).toString();
  useEffect(()=>setDraft(q),[q]);
  useEffect(()=>{if(ready&&uuid.test(request))router.replace(`/traces/${request}?w=${win}`);},[ready,request,router,win]);
  useEffect(()=>{
    if(!ready)return;const g=++generation.current;const controller=new AbortController();abort.current=controller;let timer:ReturnType<typeof setTimeout>;
    if(previousQuery.current!==query){setRows([]);setNext(null);setActive(-1);previousQuery.current=query;}
    const load=async()=>{
      setLoading(true);setError('');
      try{const r=await fetch(`/api/traces?${query}${version?'&refresh=1':''}`,{signal:controller.signal,cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error??'Traces unavailable');if(g!==generation.current)return;
        const data=b as TraceList;
        setRows(data.rows);setNext(data.next);
        setModels(old=>[...new Set([...old,...data.rows.map(r=>r.modelCall2).filter((m):m is string=>!!m)])]);
        timer=setTimeout(live,5000);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Traces unavailable');}finally{if(!controller.signal.aborted)setLoading(false);}
    };
    const live=async()=>{try{if(rowsRef.current.some(r=>!terminal(r.status))){const updates=await refreshPending(rowsRef.current,controller.signal);if(g===generation.current)setRows(old=>old.map(r=>updates.find(u=>u.id===r.id)??r));}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Live update failed');}finally{if(!controller.signal.aborted)timer=setTimeout(live,5000);}};
    void load();return()=>{controller.abort();clearTimeout(timer);};
  },[query,version,ready]);
  const loadMore=async()=>{if(!next||more)return;const g=generation.current;setMore(true);setError('');try{const r=await fetch(`/api/traces?${query}&cursor=${encodeURIComponent(next)}`,{signal:abort.current?.signal});const b=await r.json();if(!r.ok)throw new Error(b.error??'Unable to load more');if(g!==generation.current)return;setRows(old=>[...old,...(b as TraceList).rows.filter(r=>!old.some(o=>o.id===r.id))]);setNext(b.next);}catch(e){if(g===generation.current)setError(e instanceof Error?e.message:'Unable to load more');}finally{setMore(false);}};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.metaKey||e.ctrlKey||e.altKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return;
    if(e.key==='/'){e.preventDefault();search.current?.focus();}if(e.key==='j'||e.key==='k'){e.preventDefault();setActive(i=>Math.max(0,Math.min(rows.length-1,i+(e.key==='j'?1:-1))));}
    if(e.key==='Enter'&&rows[active])router.push(`/traces/${rows[active].id}?w=${win}`);if(e.key==='c'&&rows[active])void navigator.clipboard.writeText(rows[active].id);
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,rows,router,win]);
  useEffect(()=>{if(active>=0)document.querySelector(`[data-trace-id="${rows[active]?.id}"]`)?.scrollIntoView({block:'nearest'});},[active,rows]);
  const set=(key:string,value:string)=>{const setters:Record<string,(v:string)=>void>={status:setStatus,model:setModel,flags:setFlags};setters[key]?.(value);};
  return <div className="mx-auto grid max-w-[1320px] gap-4 py-4"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[22px] font-semibold">Traces</h1><div className="flex items-center gap-2">{['24h','7d','30d'].map(w=><button key={w} aria-pressed={w===win} onClick={()=>setWin(w)} className={`rounded-md px-3 py-2 text-xs ${win===w?'bg-secondary':'text-muted-foreground'}`}>{w}</button>)}<RefreshButton refreshing={loading} onClick={()=>setVersion(v=>v+1)}/></div></header>
    <form onSubmit={e=>{e.preventDefault();if(uuid.test(draft.trim()))router.push(`/traces/${draft.trim()}?w=${win}`);else setQ(draft.trim());}}><input ref={search} aria-label="Search meal text or request UUID" placeholder="Search meal text or request UUID…  /" maxLength={160} value={draft} onChange={e=>setDraft(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"/></form>
    <TraceFilters {...{status,model,flags,models,set}}/>
    <p aria-live="polite" className="text-xs text-muted-foreground">{loading&&!rows.length?'Loading traces…':rows.length?`1–${rows.length}${next?' · more available':''}`:'0 traces'}{rows.some(r=>!terminal(r.status))&&' · Live, updates every 5 s'}</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error} <button onClick={()=>setVersion(v=>v+1)} className="underline">Retry</button></p>}
    <div aria-label="Meal traces">{!ready||loading&&!rows.length?Array.from({length:10},(_,i)=><div key={i} className="h-14 animate-pulse border-b border-border bg-secondary/30"/>):rows.map((row,i)=><TraceRow key={row.id} row={row} active={i===active} win={win}/>)}</div>
    {!loading&&!rows.length&&!error&&<p className="py-10 text-center text-sm text-muted-foreground">No meals match these filters.</p>}{next&&<button disabled={more} onClick={loadMore} className="justify-self-center rounded-md border border-border px-5 py-2 text-sm disabled:opacity-50">{more?'Loading…':'Load more'}</button>}
  </div>;
}
