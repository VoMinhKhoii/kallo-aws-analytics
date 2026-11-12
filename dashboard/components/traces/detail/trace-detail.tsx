'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TraceGraphDetail } from '@/lib/traces/types';
import { useResource } from '@/lib/traces-ui/use-resource';
import { adjacentStep,buildGraph,terminal } from '@/lib/traces-ui/graph';
import { useUrlState } from '@/lib/use-url-state';
import { RefreshButton } from '@/components/console/console';
import { CaretLeft, Question } from "@phosphor-icons/react/ssr";
import { DetailSkeleton } from './detail-skeleton';
import { ShortcutSheet } from './shortcut-sheet';
import { TraceSummaryCard } from './trace-summary-card';
const PipelineCanvas=dynamic(()=>import('../canvas/pipeline-canvas'),{ssr:false,loading:()=> <div className="h-full min-h-[520px] animate-pulse bg-[var(--console-surface)]"/>});
const StepModal=dynamic(()=>import('./step-modal').then(m=>m.StepModal),{ssr:false});
const poll=(t:TraceGraphDetail)=>Date.now()-Date.parse(t.createdAt)<600000&&(!terminal(t.status)||t.completeness.truncated||t.completeness.callsLogged<t.completeness.callsBilled||(t.status==='success'&&t.completeness.stagesFound<t.completeness.stagesExpected));
export default function TraceDetail({id}:{id:string}) {
  const router=useRouter();const {data:t,error,loading,notFound,refresh}=useResource<TraceGraphDetail>(`/api/traces/${encodeURIComponent(id)}`,poll);
  const [step,setStep]=useUrlState('step',''),[win]=useUrlState('w','24h');const [fit,setFit]=useState(0),[shortcuts,setShortcuts]=useState(false);
  const graph=useMemo(()=>t?buildGraph(t):{nodes:[],edges:[]},[t]);const selected=graph.nodes.find(n=>n.id===step);
  const parentId=graph.edges.find(e=>e.target===step&&e.sourceHandle==='bottom')?.source;const parent=graph.nodes.find(n=>n.id===parentId);
  const openItem=(item:number)=>{const url=new URL(window.location.href);url.searchParams.set('step','assembly');url.searchParams.set('item',String(item));window.history.pushState(null,'',url);window.dispatchEvent(new Event('dashboard-url'));};
  const close=()=>{const url=new URL(window.location.href);url.searchParams.delete('step');url.searchParams.delete('item');window.history.pushState(null,'',url);window.dispatchEvent(new Event('dashboard-url'));};
  const navigate=(direction:number)=>{const next=adjacentStep(graph.nodes,step,direction);if(next)setStep(next);};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.metaKey||e.ctrlKey||e.altKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]'))return;
    if(shortcuts){if(e.key==='Escape'){e.preventDefault();setShortcuts(false);}return;}
    if(e.key==='['||e.key===']'){e.preventDefault();navigate(e.key==='['?-1:1);}if(e.key==='f'&&!step){e.preventDefault();setFit(n=>n+1);}if(e.key==='c'&&!step)void navigator.clipboard.writeText(id);if(e.key==='?'){e.preventDefault();setShortcuts(true);}
    // The step dialog closes itself on Escape; without one, Escape goes back to the list.
    if(e.key==='Escape'&&!step){e.preventDefault();router.push(`/traces?w=${win}`);}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  if(!t&&loading)return <DetailSkeleton/>;
  if(notFound)return <div className="grid gap-4 pt-7"><h1 className="text-2xl font-semibold">No trace for this id</h1><Link href="/traces" className="text-sm underline">Search traces</Link></div>;
  if(!t)return <div role="alert" className="pt-7 text-sm text-foreground mark-bad">{error}<button className="ml-4 underline" onClick={refresh}>Retry</button></div>;
  return <div className="trace-workspace min-w-0 pt-5 pb-6">
    <header className="flex shrink-0 items-center gap-4 pb-4">
      <Link href={`/traces?w=${win}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><CaretLeft aria-hidden="true" className="size-3.5"/>Traces</Link>
      <span className="ml-auto"><RefreshButton refreshing={loading} onClick={refresh}/></span>
      <button className="grid size-8 place-items-center rounded-[5px] text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={()=>setShortcuts(true)} aria-label="Keyboard shortcuts"><Question className="size-4"/></button>
    </header>
    {error&&<p role="alert" className="pb-2 text-sm text-foreground mark-bad">{error} <button onClick={refresh} className="underline">Retry</button></p>}
    {step&&!selected&&<p className="pb-2 text-sm text-muted-foreground mark-warn">Step not recorded: {step} <button className="underline" onClick={close}>Close</button></p>}
    <div className="relative min-h-[560px] flex-1 overflow-hidden rounded-[5px] border border-border bg-background">
      <PipelineCanvas graph={graph} selected={selected?.id??''} onSelect={setStep} duration={t.durationMs??0} fit={fit} panelWidth={0}/>
      <TraceSummaryCard trace={t} win={win} openItem={openItem}/>
    </div>
    {selected&&<StepModal key={selected.id} trace={t} step={selected} parent={parent} close={close} navigate={navigate}/>}
    {shortcuts&&<ShortcutSheet close={()=>setShortcuts(false)}/>}
  </div>;
}
