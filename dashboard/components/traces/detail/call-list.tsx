'use client';
import { useState } from 'react';
import type { TraceGraphDetail, TracePayload } from '@/lib/traces/types';
import { tokenText,callLatency } from '@/lib/traces-ui/format';
import { modelLabel } from '@/lib/traces-ui/graph';
import { ms,usd } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { ModelDetails } from './model-details';
import PayloadView from './payload-view';
function ExpandedCall({traceId,call}:{traceId:string;call:TraceGraphDetail['calls'][number]}) {
  const payload=useResource<TracePayload>(`/api/traces/${encodeURIComponent(traceId)}/payload?node=${encodeURIComponent(call.id)}`);
  const body=payload.data;
  return <div className="space-y-4 border-b border-border py-3"><ModelDetails call={call}/>{payload.error?<p role="alert" className="text-destructive">{payload.error} <button className="underline" onClick={payload.refresh}>Retry</button></p>:payload.loading&&!body?<p className="animate-pulse text-muted-foreground">Loading prompt and response…</p>:<><h4 className="font-medium">{body&&'promptIsTemplate'in body&&body.promptIsTemplate?'Prompt template (exact request not recorded)':'Prompt'}</h4><PayloadView value={body&&('prompt'in body?body.prompt:body.input)} absent="Prompt text not recorded for this call"/><h4 className="font-medium">Response</h4><PayloadView value={body&&('response'in body?body.response:body.output)} absent="Response text not recorded for this call"/></>}</div>;
}
export function CallList({traceId,calls}:{traceId:string;calls:TraceGraphDetail['calls']}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  return <div>{calls.map(c=><div key={c.id}><button aria-expanded={expanded===c.id} onClick={()=>setExpanded(v=>v===c.id?null:c.id)} className="w-full space-y-1 border-b border-border py-3 text-left hover:bg-secondary focus-visible:outline-2"><span className="flex justify-between gap-2"><strong className="font-medium">{modelLabel(c.model)} · attempt {c.attempt}</strong><span className={c.error?'text-destructive':'text-muted-foreground'}>{c.error?'error':'success'} {expanded===c.id?'▾':'▸'}</span></span><span className="block tabular text-muted-foreground">{tokenText(c)}</span><span className="block tabular text-muted-foreground">{callLatency(c.latencyMs)} · {usd(c.costUsd)}{c.error&&` · ${c.error}`}</span></button>{expanded===c.id&&<ExpandedCall traceId={traceId} call={c}/>}</div>)}</div>;
}
