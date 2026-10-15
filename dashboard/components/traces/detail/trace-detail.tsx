'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TraceGraphDetail } from '@/lib/traces/types';
import { useResource } from '@/lib/traces-ui/use-resource';
import { adjacentStep,buildGraph,terminal } from '@/lib/traces-ui/graph';
import { useUrlState } from '@/lib/use-url-state';
import { compact,ms,usd } from '@/lib/ai-usage/format';
import { MealSummary } from './meal-summary';
import { DetailSkeleton } from './detail-skeleton';
import { ShortcutSheet } from './shortcut-sheet';
import { StatusDot } from '../status-dot';
const PipelineCanvas=dynamic(()=>import('../canvas/pipeline-canvas'),{ssr:false,loading:()=> <div className="h-[520px] animate-pulse bg-secondary/30"/>});
const StepPanel=dynamic(()=>import('./step-panel'),{ssr:false});
const poll=(t:TraceGraphDetail)=>!terminal(t.status);
export default function TraceDetail({id}:{id:string}) {
  const router=useRouter();const {data:t,error,loading,notFound,refresh}=useResource<TraceGraphDetail>(`/api/traces/${encodeURIComponent(id)}`,poll);
  const [step,setStep]=useUrlState('step',''),[win]=useUrlState('w','24h');const [fit,setFit]=useState(0),[shortcuts,setShortcuts]=useState(false),[copied,setCopied]=useState(false);
  const graph=useMemo(()=>t?buildGraph(t):{nodes:[],edges:[]},[t]);const selected=graph.nodes.find(n=>n.id===step);
  const openItem=(item:number)=>{const url=new URL(window.location.href);url.searchParams.set('step','assembly');url.searchParams.set('item',String(item));window.history.pushState(null,'',url);window.dispatchEvent(new Event('dashboard-url'));};
  const close=()=>{const url=new URL(window.location.href);url.searchParams.delete('step');url.searchParams.delete('item');window.history.pushState(null,'',url);window.dispatchEvent(new Event('dashboard-url'));};
  const navigate=(direction:number)=>{const next=adjacentStep(graph.nodes,step,direction);if(next)setStep(next);};
  const copy=()=>{void navigator.clipboard.writeText(id).then(()=>setCopied(true));};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.metaKey||e.ctrlKey||e.altKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return;
    if(shortcuts){if(e.key==='Escape'){e.preventDefault();setShortcuts(false);}return;}
    if(e.key==='['||e.key===']'){e.preventDefault();navigate(e.key==='['?-1:1);}if(e.key==='f'){e.preventDefault();setFit(n=>n+1);}if(e.key==='c')copy();if(e.key==='?'){e.preventDefault();setShortcuts(true);}if(e.key==='Escape'){e.preventDefault();if(step)close();else router.push(`/traces?w=${win}`);}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  if(!t&&loading)return <DetailSkeleton/>;
  if(notFound)return <div className="py-8"><h1 className="text-lg">No trace for this id</h1><Link href="/traces" className="mt-4 block text-sm underline">Search traces</Link></div>;
  if(!t)return <div role="alert" className="py-8 text-sm text-destructive">{error}<button className="ml-3 underline" onClick={refresh}>Retry</button></div>;
  const cost=t.calls.length&&t.calls.every(c=>c.costUsd!=null)?t.calls.reduce((s,c)=>s+c.costUsd!,0):null;
  return <div className="min-w-0 py-4"><header className="min-h-[88px] border-b border-border pb-3"><div className="flex items-start gap-4"><Link href={`/traces?w=${win}`} className="shrink-0 pt-1 text-xs text-muted-foreground">← Traces</Link><h1 className="line-clamp-2 text-lg font-medium">{t.rawInput||t.mealName||'Meal trace'}</h1></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><button onClick={copy} title={id}>{id.slice(0,8)} {copied?'Copied':'⧉'}</button><span>· {new Date(t.createdAt).toISOString().replace('T',' ').slice(0,19)} UTC</span><StatusDot status={t.status}/><span>{t.status}{t.errorCode&&` · ${t.errorCode}`}</span><span>· {ms(t.durationMs)} · {[...new Set(t.calls.map(c=>c.model))].join(' → ')} · {usd(cost)} · {compact(t.calls.reduce((s,c)=>s+(c.inputTokens??0)+(c.outputTokens??0)+(c.thoughtTokens??0),0))} tokens · {t.calls.length} attempts</span><button onClick={refresh} disabled={loading} className="ml-auto underline disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button><button onClick={()=>setShortcuts(true)} aria-label="Keyboard shortcuts">?</button></div></header>
    {error&&<p role="alert" className="py-2 text-xs text-destructive">{error} <button onClick={refresh} className="underline">Retry</button></p>}
    {(!terminal(t.status)||t.completeness.stagesFound<t.completeness.stagesExpected||t.completeness.truncated)&&<p className="py-2 text-xs text-[var(--console-amber)]">{!terminal(t.status)&&'Live · updates every 5 s · '}{t.completeness.stagesFound} of {t.completeness.stagesExpected} stages recorded{t.completeness.truncated&&' · Partial capture'}</p>}
    {step&&!selected&&<p className="py-2 text-xs text-[var(--console-amber)]">Step not recorded: {step} <button className="underline" onClick={close}>Close</button></p>}
    <div className="trace-detail-body flex min-w-0"><div className="flex min-w-0 flex-1 flex-col"><MealSummary trace={t} openAssembly={openItem}/><div className="min-w-0 flex-1"><PipelineCanvas graph={graph} selected={selected?.id??''} onSelect={setStep} duration={t.durationMs??0} fit={fit}/></div></div>{selected&&<StepPanel key={selected.id} trace={t} step={selected} close={close} navigate={navigate}/>}</div>
    {shortcuts&&<ShortcutSheet close={()=>setShortcuts(false)}/>}
  </div>;
}
