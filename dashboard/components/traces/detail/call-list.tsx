'use client';
import { downloadJson } from '@/lib/download-json';
import { useState } from 'react';
import type { TraceGraphDetail, TracePayload } from '@/lib/traces/types';
import { tokenText,callLatency } from '@/lib/traces-ui/format';
import { callStart, classifyCall } from '@/lib/traces-ui/graph';
import { ms,usd } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { ModelDetails } from './model-details';
import PayloadView from './payload-view';
function ExpandedCall({traceId,source,call}:{traceId:string;source:TraceGraphDetail['source'];call:TraceGraphDetail['calls'][number]}) {
  const payload=useResource<TracePayload>(`/api/traces/${encodeURIComponent(traceId)}/payload?node=${encodeURIComponent(call.id)}&source=${source}&kind=call`);
  const body=payload.data;
  return <div className="space-y-4 border-b border-border py-4"><ModelDetails call={call}/><button className="underline disabled:opacity-50" disabled={!body||payload.loading||!!payload.error} onClick={()=>downloadJson(`${traceId}-${call.id}.json`,{metadata:call,payload:body})}>Download JSON</button>{payload.error?<p role="alert" className="text-foreground mark-bad">{payload.error} <button className="underline" onClick={payload.refresh}>Retry</button></p>:payload.loading&&!body?<p className="animate-pulse text-muted-foreground">Loading prompt and response…</p>:<><h4 className="font-medium">{body&&'promptIsTemplate'in body&&body.promptIsTemplate?'Prompt template (exact request not recorded)':'Prompt'}</h4><PayloadView value={body&&('prompt'in body?body.prompt:body.input)} absent="Prompt text not recorded for this call"/><h4 className="font-medium">Response</h4><PayloadView value={body&&('response'in body?body.response:body.output)} absent="Response text not recorded for this call"/></>}</div>;
}
export function CallList({trace,calls}:{trace:TraceGraphDetail;calls:TraceGraphDetail['calls']}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const base=Date.parse(trace.createdAt);
  const ordered=[...calls].sort((a,b)=>callStart(a,base)-callStart(b,base));
  const all=[...trace.calls].sort((a,b)=>callStart(a,base)-callStart(b,base));
  return <div className="overflow-x-auto">{ordered.map((c,i)=>{
    const role=classifyCall(c,trace);
    const job=role==='selector'?'selector':role==='call2_chunk'?all.filter(x=>classifyCall(x,trace)==='call2_chunk').length===1?'Call 2':`call 2 · chunk ${all.filter(x=>classifyCall(x,trace)==='call2_chunk').findIndex(x=>x.id===c.id)+1}`:role==='call1'?(all.filter(x=>classifyCall(x,trace)==='call1').findIndex(x=>x.id===c.id)>0?'Call 1 · re-ask':'Call 1'):role.startsWith('rescue')?role.replaceAll('_',' '):`Call ${i+1} of ${ordered.length}`;
    const facts=[`#${all.findIndex(x=>x.id===c.id)+1}`,job,c.startedAt||c.createdAt?`+${ms(callStart(c,base))}`:'',c.attempt>1?`attempt ${c.attempt}`:'',tokenText(c),c.latencyMs!=null&&c.latencyMs>0?callLatency(c.latencyMs):'',usd(c.costUsd)].filter(Boolean).join(' · ');
    return <div key={c.id}><button aria-expanded={expanded===c.id} title={facts} onClick={()=>setExpanded(v=>v===c.id?null:c.id)} className="flex min-h-7 w-full items-start gap-2 whitespace-normal py-1 sm:items-center sm:whitespace-nowrap border-b border-border text-left text-xs tabular hover:bg-secondary focus-visible:outline-2"><span className="min-w-0 flex-1 sm:truncate"><span>{facts.split(' · ').slice(0,2).join(' · ')}</span><span className="block sm:inline"> · {facts.split(' · ').slice(2).join(' · ')}</span></span><span className={`shrink-0 text-xs ${c.error?'text-foreground mark-bad':'text-muted-foreground mark-good'}`}>{c.error?'Failed':'OK'}</span></button>{expanded===c.id&&<ExpandedCall traceId={trace.id} source={trace.source} call={c}/>}</div>;
  })}</div>;
}
