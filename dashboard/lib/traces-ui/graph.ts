import type { TraceGraphDetail, TraceCall } from '../traces/types';
export type StepKind = 'request'|'stage'|'attempt'|'chunk'|'selector'|'rescue'|'gap'|'after-response'|'unattributed'|'ghost'|'response';
export interface Step {
  id:string; kind:StepKind; name:string; status:string; start:number; duration:number|null;
  count:string; cost:number|null; calls:string[]; payloadKey?:string; error?:string|null;
  position:{x:number;y:number}; afterResponse?:boolean;
}
export interface Connection { id:string; source:string; target:string; dashed?:boolean; dotted?:boolean; label?:string; failed:boolean }
export const stageNames = ['decomposition','matching','nutrition','assembly'];
export const terminal = (status:string) => ['success','error','completed','failed'].includes(status);
const time = (v:string|undefined, base:number) => v && Number.isFinite(Date.parse(v)) ? Date.parse(v)-base : 0;
export function callStart(c:TraceCall, base:number) { return c.startedAt ? time(c.startedAt,base) : Math.max(0,time(c.createdAt,base)-(c.latencyMs??0)); }
export function gapWindow(trace:TraceGraphDetail) {
  const base=Date.parse(trace.createdAt), duration=trace.durationMs??0;
  const windows=trace.stages.map(s=>({start:Math.max(0,time(s.startedAt,base)),end:Math.min(duration,time(s.startedAt,base)+(s.durationMs??0)),name:s.name})).sort((a,b)=>a.start-b.start);
  let end=0, after='request', largest={start:0,ms:0,after};
  for (const w of [...windows,{start:duration,end:duration,name:'response'}]) {
    if(w.start-end>largest.ms) largest={start:end,ms:w.start-end,after};
    if(w.end>end){end=w.end;after=w.name;}
  }
  const difference=Math.max(0,duration-trace.stages.reduce((n,s)=>n+(s.durationMs??0),0));
  return {...largest,ms:difference};
}
export function buildGraph(trace:TraceGraphDetail) {
  const base=Date.parse(trace.createdAt), nodes:Step[]=[], edges:Connection[]=[];
  const sorted=[...trace.calls].sort((a,b)=>callStart(a,base)-callStart(b,base)||a.id.localeCompare(b.id));
  const add=(s:Step)=>{nodes.push(s);return s;};
  const edge=(source:string,target:string,options:Partial<Connection>={})=>edges.push({id:`${source}:${target}`,source,target,failed:!!nodes.find(n=>n.id===source)?.error,...options});
  const make=(id:string,kind:StepKind,name:string,col:number,lane:number,calls:TraceCall[]=[],start=calls.length?Math.min(...calls.map(c=>callStart(c,base))):0,duration:number|null=calls.length?Math.max(...calls.map(c=>callStart(c,base)+(c.latencyMs??0)))-start:null):Step=>({id,kind,name,status:calls.some(c=>c.error)?'error':trace.status==='pending'?'pending':'success',start,duration,count:calls.length?`${calls.length} calls`:'',cost:calls.length&&calls.every(c=>c.costUsd!==null)?calls.reduce((n,c)=>n+c.costUsd!,0):null,calls:calls.map(c=>c.id),error:calls.find(c=>c.error)?.error,position:{x:col*220,y:lane*72}});
  add({...make('request','request','Request',0,0,[],0,0),status:'success',count:`${trace.rawInput.length} characters`});
  let previous='request';
  stageNames.forEach((name,i)=>{
    const stage=trace.stages.find(s=>s.name===name || s.key===name);
    const calls=sorted.filter(c=>stage?.calls.includes(c.id));
    const step=make(name,stage?'stage':'ghost',stage?name:`${name} · not recorded`,i+1,0,calls,stage?time(stage.startedAt,base):0,stage?.durationMs??null);
    if(stage){step.payloadKey=stage.key;step.status=stage.status;step.error=stage.error;step.count=`${stage.inputBytes.toLocaleString()} → ${stage.outputBytes.toLocaleString()} B`;}
    else {step.status='missing';step.count='not recorded';}
    add(step);edge(previous,name,{dotted:!stage});previous=name;
  });
  add({...make('response','response','Response',5,0,[],trace.durationMs??0,trace.durationMs),status:trace.status,error:trace.errorCode??trace.error,count:trace.errorCode??trace.status});edge(previous,'response');
  const consumed=new Set<string>(); const laneByCol=new Map<number,number>();
  const lane=(col:number)=>{const n=laneByCol.get(col)??1;laneByCol.set(col,n+1);return n;};
  const attempts=(calls:TraceCall[],prefix:string,col:number,kind:StepKind='attempt',parent?:string)=>{
    calls.forEach((c,i)=>{
      const actualCol=c.afterResponse?6:col;
      consumed.add(c.id);let id=prefix==='attempt'?`attempt-${sorted.findIndex(a=>a.id===c.id)+1}`:calls.length===1?prefix:`${prefix}${i?`.retry-${String.fromCharCode(96+i)}`:''}`;
      if(nodes.some(n=>n.id===id))id=`${id}.attempt-${c.attempt}-${sorted.findIndex(a=>a.id===c.id)+1}`;
      const start=callStart(c,base);
      add({...make(id,kind,kind==='chunk'?`Chunk ${i+1} · ${c.model}`:c.model,actualCol,lane(actualCol),[c],start,c.latencyMs),payloadKey:c.id,count:`${c.inputTokens??'—'} → ${c.outputTokens??'—'} tok`,afterResponse:c.afterResponse});
      edge(parent??stageNames[Math.max(0,col-1)],id,{dashed:!!c.fallbackFrom,label:c.fallbackFrom?'fallback':undefined});
      if(c.fallbackFrom){const before=nodes.findLast(n=>n.id!==id&&['attempt','chunk'].includes(n.kind)&&n.calls.some(cid=>trace.calls.find(a=>a.id===cid)?.model===c.fallbackFrom));if(before)edge(before.id,id,{dashed:true,label:'fallback'});}
    });
  };
  const normal=sorted.filter(c=>!c.afterResponse&&!c.role.startsWith('rescue')); 
  attempts(normal.filter(c=>c.role==='call1'),'decomposition.call-1',1,'attempt','decomposition');
  const selectors=normal.filter(c=>c.role==='selector');
  if(selectors.length){selectors.forEach(c=>consumed.add(c.id));const s=add(make('matching.selector','selector',`Selector ×${selectors.length}`,2,lane(2),selectors,Math.min(...selectors.map(c=>callStart(c,base))),Math.max(...selectors.map(c=>callStart(c,base)+(c.latencyMs??0)))-Math.min(...selectors.map(c=>callStart(c,base)))));s.count=`${Math.round(selectors.reduce((sum,c)=>sum+(c.outputTokens??0),0)/selectors.length)} tok each`;edge('matching',s.id);}
  const chunks=normal.filter(c=>c.role==='call2_chunk');let chunk=0;
  chunks.forEach(c=>{if(c.attempt<=1||!chunk)chunk++; attempts([c],`nutrition.chunk-${chunk}${c.attempt>1?`.retry-${String.fromCharCode(95+c.attempt)}`:''}`,3+(chunk-1)%2,'chunk','nutrition');});
  let rescue=0;let rescueId='';
  sorted.filter(c=>c.role.startsWith('rescue')).forEach(c=>{
    if(c.role==='rescue_call1'||!rescueId){rescue++;rescueId=`rescue-${rescue}`;const r=add(make(rescueId,'rescue',`Rescue ${rescue}`,3,lane(3),[],callStart(c,base),0));edge('nutrition',r.id,{dashed:true,label:'rescue'});edge(r.id,'assembly',{dashed:true});}
    const group=nodes.find(n=>n.id===rescueId)!;group.calls.push(c.id);group.duration=Math.max(group.duration??0,callStart(c,base)+(c.latencyMs??0)-group.start);group.afterResponse ||= c.afterResponse;group.error ||= c.error;
    if(group.afterResponse){group.count='finished after response';const e=edges.find(e=>e.source===rescueId&&e.target==='assembly');if(e)e.dotted=true;}
    attempts([c],`${rescueId}.${c.role==='rescue_call1'?'call-1':c.role==='rescue_selector'?'selector':'call-2'}`,4,'attempt',rescueId);
  });
  const after=sorted.filter(c=>c.afterResponse);
  if(after.length){add(make('after-response','after-response','After response',6,0,after));attempts(after.filter(c=>!consumed.has(c.id)),'attempt',6,'attempt','after-response');nodes.filter(n=>n.afterResponse&&n.kind==='attempt'&&n.id!=='after-response').forEach(n=>edge('after-response',n.id,{dotted:true}));}
  const unknown=sorted.filter(c=>!consumed.has(c.id));
  if(unknown.length){add(make('unattributed','unattributed','Unattributed',0,lane(0),unknown));attempts(unknown,'attempt',0,'attempt','unattributed');}
  const gap=gapWindow(trace);
  if(gap.ms>0){const col=Math.max(0,stageNames.indexOf(gap.after)+1);add({...make('gap','gap','Unaccounted',col,lane(col),[],gap.start,gap.ms),count:'waits, rescue, I/O'});edge(gap.after,'gap',{dotted:true});}
  // Group metadata must reflect all children, including failures and unknown pricing.
  nodes.filter(n=>n.kind==='rescue').forEach(n=>{const calls=trace.calls.filter(c=>n.calls.includes(c.id));n.status=n.error?'error':'success';n.cost=calls.every(c=>c.costUsd!==null)?calls.reduce((sum,c)=>sum+c.costUsd!,0):null;});
  edges.forEach(e=>e.failed=!!nodes.find(n=>n.id===e.source)?.error||['error','failed'].includes(nodes.find(n=>n.id===e.source)?.status??''));
  return {nodes,edges};
}
export const timeOrder=(steps:Step[])=>[...steps].sort((a,b)=>a.start-b.start||a.position.x-b.position.x||a.id.localeCompare(b.id));
export function adjacentStep(steps:Step[],id:string,direction:number) {const order=timeOrder(steps);return order[Math.max(0,Math.min(order.length-1,order.findIndex(s=>s.id===id)+direction))]?.id;}
