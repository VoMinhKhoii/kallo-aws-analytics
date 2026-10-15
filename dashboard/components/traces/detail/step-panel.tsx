'use client';
import { useEffect,useRef,useState } from 'react';
import type { Step } from '@/lib/traces-ui/graph';
import type { TraceGraphDetail,TracePayload } from '@/lib/traces/types';
import { useResource } from '@/lib/traces-ui/use-resource';
import { useUrlState } from '@/lib/use-url-state';
import { ms } from '@/lib/ai-usage/format';
import { CallList } from './call-list';
import { PanelSection } from './panel-section';
import { ModelDetails } from './model-details';
import PayloadView from './payload-view';
export default function StepPanel({trace,step,close,navigate,onWidthChange}:{trace:TraceGraphDetail;step:Step;close:()=>void;navigate:(direction:number)=>void;onWidthChange:(width:number)=>void}) {
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(!panelRef.current)return;const observer=new ResizeObserver(entries=>onWidthChange(entries[0].contentRect.width));observer.observe(panelRef.current);return()=>observer.disconnect();},[onWidthChange]);
  const [item]=useUrlState('item','');
  const [width,setWidth]=useState(480);
  const calls=trace.calls.filter(c=>step.calls.includes(c.id));const group=calls.length>0&&!step.payloadKey;
  const key=step.payloadKey;
  const stage=trace.stages.find(s=>s.key===key);
  const labels:Record<string,string>={ingredientCount:'Ingredients',matchedCount:'Matched',unmatchedCount:'Unmatched',mealItemCount:'Items',itemCount:'Items',chunkCount:'Chunks',failedChunkCount:'Failed chunks',isFood:'Is food',mealSlot:'Meal slot'};
  const payload=useResource<TracePayload>(key?`/api/traces/${encodeURIComponent(trace.id)}/payload?node=${encodeURIComponent(key)}`:null);
  const body=key?payload.data:null;const call=calls.find(c=>c.id===key);const error=call?.error??step.error;
  const download=()=>{const blob=new Blob([JSON.stringify({step,metadata:call??step,payload:body},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${trace.id}-${step.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const input=body&&('input'in body?body.input:body.prompt),output=body&&('output'in body?body.output:body.response);
  return <aside ref={panelRef} aria-label={`${step.name} step details`} className="trace-step-panel min-w-0 shrink-0 border-l border-border bg-card" style={{'--drawer-width':`${width}px`} as React.CSSProperties}>
    <div role="separator" aria-label="Resize step panel" aria-orientation="vertical" tabIndex={0} className="absolute inset-y-0 -left-1 z-30 hidden w-2 cursor-col-resize lg:block" onKeyDown={e=>{if(e.key==='ArrowLeft')setWidth(w=>Math.min(720,w+20));if(e.key==='ArrowRight')setWidth(w=>Math.max(360,w-20));}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const start=e.clientX,initial=width;const move=(event:PointerEvent)=>setWidth(Math.max(360,Math.min(720,initial+start-event.clientX)));const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});}}/>
    <header className="border-b border-border p-4"><div className="flex items-start justify-between gap-2"><h2 className="text-sm font-semibold">{step.name}</h2><button onClick={close} aria-label="Close step panel" className="text-xs text-muted-foreground">Close · Esc</button></div><p className="mt-2 text-xs text-muted-foreground">{step.status} · {ms(step.duration)} · started +{ms(step.start)}</p><div className="mt-3 flex gap-4 text-xs"><button onClick={()=>navigate(-1)}>← Prev</button><button onClick={()=>navigate(1)}>Next →</button></div></header>
    <div className="trace-panel-scroll overflow-y-auto"><PanelSection title="Summary">{stage?<dl className="space-y-2">{Object.entries(stage.stats).map(([key,value])=><div key={key} className="flex justify-between gap-4"><dt className="text-muted-foreground">{labels[key]??key}</dt><dd>{value??'—'}</dd></div>)}</dl>:<p>{step.count||'No additional counts recorded'}</p>}{step.payloadKey&&<p className="mt-2 text-muted-foreground">{trace.stages.find(s=>s.key===step.payloadKey)?.inputBytes.toLocaleString()} → {trace.stages.find(s=>s.key===step.payloadKey)?.outputBytes.toLocaleString()} B captured</p>}{step.id==='assembly'&&item!==''&&trace.summary.items[Number(item)]&&<p className="mt-3 text-[var(--console-blue)]">Selected item {Number(item)+1}: {trace.summary.items[Number(item)].name}</p>}{step.afterResponse&&<p className="mt-2 text-[var(--console-amber)]">Finished after response. Result dropped.</p>}</PanelSection>
    {calls.length>0&&<PanelSection title="Calls"><CallList traceId={trace.id} calls={calls}/></PanelSection>}
    {call&&<PanelSection title="Model"><ModelDetails call={call}/></PanelSection>}
    {error&&<PanelSection title="Error"><p className="whitespace-pre-wrap break-words text-destructive">{error}</p><button onClick={()=>void navigator.clipboard.writeText(error)} className="mt-2 underline">Copy error</button></PanelSection>}
    {key&&payload.error&&<p role="alert" className="p-4 text-xs text-destructive">{payload.error} <button onClick={payload.refresh} className="underline">Retry</button></p>}
    {!group&&<><PanelSection title={body&&'promptIsTemplate'in body&&body.promptIsTemplate?'Input · Prompt template (exact request not recorded)':'Input'}>{key&&payload.loading&&!body?<div className="h-[338px] animate-pulse bg-secondary/40"/>:<PayloadView value={key?input:step.kind==='request'?{rawInput:trace.rawInput,profile:trace.profile}:null} absent={call?'Prompt text not recorded for this call':'Input not recorded for this step'}/>}</PanelSection>
    <PanelSection title="Output">{key&&payload.loading&&!body?<div className="h-[338px] animate-pulse bg-secondary/40"/>:<PayloadView value={key?output:step.kind==='response'?{status:trace.status,error:trace.error,durationMs:trace.durationMs}:null} absent={call?'Response text not recorded for this call':'Output not recorded for this step'}/>}</PanelSection>
    </>}<PanelSection title="Raw" open={false}><button disabled={!!key&&payload.loading} onClick={download} className="underline disabled:opacity-50">Download JSON</button></PanelSection></div>
  </aside>;
}
