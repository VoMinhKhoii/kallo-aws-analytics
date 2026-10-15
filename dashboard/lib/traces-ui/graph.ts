import type { TraceGraphDetail, TraceCall } from '../traces/types';
import { describeModels } from '../ai-usage/models';
import { compact, ms } from '../ai-usage/format';
export type StepKind = 'request'|'stage'|'attempt'|'chunk'|'selector'|'rescue'|'gap'|'after-response'|'unattributed'|'ghost'|'response';
export interface Step {
  id:string; kind:StepKind; name:string; status:string; start:number; duration:number|null;
  count:string; cost:number|null; calls:string[]; payloadKey?:string; error?:string|null;
  position:{x:number;y:number}; afterResponse?:boolean;
}
export interface Connection { id:string; source:string; target:string; dashed?:boolean; dotted?:boolean; label?:string; failed:boolean; sourceHandle?:string; targetHandle?:string }
export const stageNames = ['decomposition','matching','nutrition','assembly'];
export const terminal = (status:string) => ['success','error','completed','failed'].includes(status);
export const plural = (n:number, noun:string) => `${n} ${noun}${n===1?'':'s'}`;
export const modelLabel = (id:string) => describeModels([id],new Set())[0]?.label.replace(/^Claude /,'') ?? id;
const time = (v:string|undefined, base:number) => v && Number.isFinite(Date.parse(v)) ? Date.parse(v)-base : 0;
export function callStart(c:TraceCall, base:number) { return c.startedAt ? time(c.startedAt,base) : Math.max(0,time(c.createdAt,base)-(c.latencyMs??0)); }
/** Legacy role recovery is bounded by recorded stage windows, never column membership. */
export function classifyCall(c:TraceCall, trace:TraceGraphDetail):TraceCall['role']|'afterResponse' {
  const base=Date.parse(trace.createdAt), start=callStart(c,base);
  if(c.afterResponse || (trace.durationMs!==null && start>=trace.durationMs))return 'afterResponse';
  const inside=(name:string)=>{const s=trace.stages.find(s=>s.name===name);return s&&s.durationMs!==null&&start>=time(s.startedAt,base)&&start<time(s.startedAt,base)+s.durationMs;};
  // Older adapters assigned a nutrition role from the completion window alone.
  const legacyNutrition=c.role==='call2_chunk'&&!c.workKind&&c.stage!==null;
  if(c.role!=='unknown'&&!legacyNutrition)return c.role;
  if((inside('matching')||inside('nutrition'))&&c.outputTokens!==null&&c.outputTokens<=40&&c.inputTokens!==null&&c.inputTokens<4000)return 'selector';
  if(legacyNutrition)return c.role;
  if(inside('nutrition')&&c.outputTokens!==null&&c.outputTokens>40)return 'call2_chunk';
  const decomposition=trace.stages.find(s=>s.name==='decomposition');
  if(decomposition&&decomposition.durationMs!==null&&start<time(decomposition.startedAt,base)+decomposition.durationMs)return 'call1';
  return 'unknown';
}
export function gapWindow(trace:TraceGraphDetail) {
  const base=Date.parse(trace.createdAt), duration=trace.durationMs??0;
  const windows=trace.stages.map(s=>({start:Math.max(0,Math.min(duration,time(s.startedAt,base))),end:Math.max(0,Math.min(duration,time(s.startedAt,base)+(s.durationMs??0))),name:s.name})).sort((a,b)=>a.start-b.start);
  let end=0, after='request', largest={start:0,ms:0,after};
  for(const w of [...windows,{start:duration,end:duration,name:'response'}]){
    if(w.start-end>largest.ms)largest={start:end,ms:w.start-end,after};
    if(w.end>end){end=w.end;after=w.name;}
  }
  return largest;
}
export function buildGraph(trace:TraceGraphDetail) {
  const base=Date.parse(trace.createdAt),nodes:Step[]=[],edges:Connection[]=[];
  const sorted=[...trace.calls].sort((a,b)=>callStart(a,base)-callStart(b,base)||a.id.localeCompare(b.id));
  const roles=new Map(sorted.map(c=>[c.id,classifyCall(c,trace)]));
  const byRole=(role:string)=>sorted.filter(c=>roles.get(c.id)===role);
  const chunks:TraceCall[][]=[];
  for(const c of byRole('call2_chunk')){if(c.attempt>1&&chunks.length)chunks[chunks.length-1].push(c);else chunks.push([c]);}
  const make=(id:string,kind:StepKind,name:string,x:number,y:number,calls:TraceCall[]=[],start=calls.length?Math.min(...calls.map(c=>callStart(c,base))):0,duration:number|null=calls.length?Math.max(...calls.map(c=>callStart(c,base)+(c.latencyMs??0)))-start:null):Step=>({id,kind,name,status:calls.some(c=>c.error)?'error':trace.status==='pending'?'pending':'success',start,duration,count:'',cost:calls.length&&calls.every(c=>c.costUsd!==null)?calls.reduce((n,c)=>n+c.costUsd!,0):null,calls:calls.map(c=>c.id),error:calls.find(c=>c.error)?.error,position:{x,y}});
  const add=(s:Step)=>{nodes.push(s);return s;};
  const edge=(source:string,target:string,options:Partial<Connection>={})=>edges.push({id:`${source}:${target}`,source,target,failed:false,...options});
  const kcal=trace.summary.kcal;const total=kcal===null?'No kcal recorded':`${Math.round(typeof kcal==='number'?kcal:kcal.mid)} kcal`;
  const selectors=byRole('selector');
  const counts=[trace.summary.items.length?plural(trace.summary.items.length,'item'):'Item details in panel',selectors.length?plural(selectors.length,'selector'):'Matching details in panel',`${plural(chunks.length,'chunk')} · ${chunks.filter(c=>c.every(a=>a.error)).length} failed`,total];
  // Leave room for up to three chunk groups without spilling into Assembly.
  const gap=gapWindow(trace); const gapIndex=['request',...stageNames].indexOf(gap.after);
  const assemblyX=990+Math.max(330,(chunks.length<=3?Math.max(1,chunks.length):1)*250+40);
  const xs=[0,330,660,990,assemblyX,assemblyX+330].map((x,i)=>x+(gap.ms>=500&&i>gapIndex?180:0));
  add({...make('request','request','Request',xs[0],0,[],0,0),status:'success',count:'Meal input'});
  stageNames.forEach((name,i)=>{const stage=trace.stages.find(s=>s.name===name||s.key===name);const calls=sorted.filter(c=>stage?.calls.includes(c.id));const step=make(name,stage?'stage':'ghost',name[0].toUpperCase()+name.slice(1),xs[i+1],0,calls,stage?time(stage.startedAt,base):0,stage?.durationMs??null);step.count=stage?counts[i]:'Not recorded';step.status=stage?.status??'missing';step.payloadKey=stage?.key;step.error=stage?.error;add(step);});
  add({...make('response','response','Response',xs[5],0,[],trace.durationMs??0,trace.durationMs),status:trace.status,error:trace.errorCode??trace.error,count:`${ms(trace.durationMs)} · ${trace.status}`});
  const spine=['request',...stageNames,'response'];
  spine.slice(0,-1).forEach((id,i)=>{if(gap.ms>=500&&gap.after===id){const g=add({...make('gap','gap',`Unaccounted ${ms(gap.ms)}`,xs[i]+250,24,[],gap.start,gap.ms),count:''});edge(id,g.id,{dashed:true});edge(g.id,spine[i+1],{dashed:true});}else edge(id,spine[i+1]);});
  const tokens=(calls:TraceCall[])=>{const sum=(key:'inputTokens'|'outputTokens')=>calls.every(c=>c[key]!==null)?compact(calls.reduce((n,c)=>n+(c[key]??0),0)):'—';return `${sum('inputTokens')} → ${sum('outputTokens')} tok`;};
  const child=(s:Step,parent:string)=>{add(s);edge(parent,s.id,{sourceHandle:'bottom',targetHandle:'top'});};
  byRole('call1').forEach((c,i)=>child({...make(`decomposition.call-${i+1}`,'attempt',`Call 1 · ${modelLabel(c.model)}`,xs[1],132+i*96,[c]),count:tokens([c])},'decomposition'));
  if(selectors.length){const avg=(key:'inputTokens'|'outputTokens')=>selectors.every(c=>c[key]!==null)?compact(Math.round(selectors.reduce((n,c)=>n+(c[key]??0),0)/selectors.length)):'—';child({...make('matching.selector','selector',`Selector ×${selectors.length}`,xs[2],132,selectors),count:`${[...new Set(selectors.map(c=>modelLabel(c.model)))].join(', ')} · ~${avg('inputTokens')} → ${avg('outputTokens')} tok each`},'matching');}
  chunks.forEach((calls,i)=>child({...make(`nutrition.chunk-${i+1}`,'chunk',`Call 2 · chunk ${i+1}/${chunks.length}`,xs[3]+(chunks.length<=3?i*250:0),132+(chunks.length>3?i*96:0),calls),status:calls.at(-1)?.error?'error':'success',error:calls.at(-1)?.error,count:`${calls.length>1?`retried ×${calls.length} · `:''}${tokens(calls)}`},'nutrition'));
  const rescues:TraceCall[][]=[];
  sorted.filter(c=>String(roles.get(c.id)).startsWith('rescue')).forEach(c=>{if(c.role==='rescue_call1'||!rescues.length)rescues.push([]);rescues[rescues.length-1].push(c);});
  const low=Math.max(300,180+Math.max(chunks.length>3?chunks.length:1,byRole('call1').length)*96);
  rescues.forEach((calls,i)=>{const r=add({...make(`rescue-${i+1}`,'rescue',`Rescue ${i+1} · ingredient not recorded`,xs[3]+i*250,low,calls),count:`${plural(calls.length,'call')} · ${ms(Math.max(...calls.map(c=>callStart(c,base)+(c.latencyMs??0)))-callStart(calls[0],base))}`});edge('nutrition',r.id,{dashed:true,sourceHandle:'bottom',targetHandle:'top'});edge(r.id,'assembly',{dashed:true});});
  const after=byRole('afterResponse');if(after.length){const s=add({...make('after-response','after-response',`After response · ${plural(after.length,'call')}`,xs[5],132,after),count:`Finished +${ms(Math.max(...after.map(c=>callStart(c,base)+(c.latencyMs??0)))-(trace.durationMs??0))}`,afterResponse:true});edge('response',s.id,{dotted:true,sourceHandle:'bottom',targetHandle:'top'});}
  const unknown=byRole('unknown');if(unknown.length)add({...make('unattributed','unattributed',`Unattributed · ${plural(unknown.length,'call')}`,0,low+120,unknown),count:'Stage not recorded'});
  edges.forEach(e=>e.failed=!!nodes.find(n=>n.id===e.source)?.error||['error','failed'].includes(nodes.find(n=>n.id===e.source)?.status??''));
  return {nodes,edges};
}
export const timeOrder=(steps:Step[])=>[...steps].sort((a,b)=>a.start-b.start||a.position.x-b.position.x||a.id.localeCompare(b.id));
export function adjacentStep(steps:Step[],id:string,direction:number) {const order=timeOrder(steps);return order[Math.max(0,Math.min(order.length-1,order.findIndex(s=>s.id===id)+direction))]?.id;}
