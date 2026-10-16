import test from 'node:test';
import assert from 'node:assert/strict';
import { loggingDetail } from '../../traces/logging';
import { buildGraph, callStart } from '../graph';
const id='00000000-0000-4000-8000-000000000001';
const at=(ms:number)=>new Date(Date.parse('2026-10-16T12:00:00Z')+ms).toISOString();
const entry=(type:string,seq:number,body:object,ms=seq*1000):{timestamp:string;jsonPayload:Record<string,unknown>}=>({timestamp:at(ms),jsonPayload:{kind:'kallo_trace_v1',requestId:id,eventId:`event-${seq}`,seq,type,part:1,parts:1,...body}});
test('Logging meal shapes recover selectors, re-asks, ordered chunks and call start offsets',()=>{
  const entries=[entry('request',0,{}),entry('stage',1,{stage:'decomposition',index:0,startedAt:at(0),durationMs:3000,status:'success'}),entry('stage',2,{stage:'nutrition',index:2,startedAt:at(3000),durationMs:20000,status:'success'}),
    entry('llm',3,{stage:'decomposition',model:'synthetic',attempt:1,latencyMs:500}),entry('llm',4,{stage:'decomposition',model:'synthetic',attempt:2,latencyMs:500}),
    entry('llm',5,{stage:'nutrition',model:'synthetic',latencyMs:1000,inputTokens:14290,outputTokens:1028,response:'{"mealItems":[{"name":"Synthetic rice"}]}'}),
    ...Array.from({length:8},(_,i)=>entry('llm',6+i,{stage:'nutrition',model:'synthetic',latencyMs:100,inputTokens:1500,outputTokens:19,response:'{"ranking":[0]}'})),
    entry('llm',14,{stage:'nutrition',model:'synthetic',latencyMs:700,inputTokens:2000,outputTokens:166,response:'{"mealItems":[{"name":"Synthetic soup"}]}'}),entry('final',15,{})];
  // Nutrition payload split across Cloud Logging entries, received out of order.
  const raw=JSON.stringify(entries[5].jsonPayload), original=entries[5];
  entries.splice(5,1,{...original,jsonPayload:{...original.jsonPayload,parts:2,part:2,payload:raw.slice(80)}},{...original,jsonPayload:{...original.jsonPayload,parts:2,part:1,payload:raw.slice(0,80)}});
  const detail=loggingDetail({id,created_at:at(0),duration_ms:30000,status:'success'},entries,12)!;
  assert.equal(detail.calls.filter(c=>c.role==='call1').length,2);
  assert.equal(detail.calls.filter(c=>c.role==='selector').length,8);
  assert.equal(detail.calls.filter(c=>c.role==='call2_chunk').length,2);
  assert.equal(callStart(detail.calls[2],Date.parse(at(0))),4000);
  assert.equal(callStart(detail.calls.at(-1)!,Date.parse(at(0))),13300);
  const graph=buildGraph(detail as never);
  assert.match(graph.nodes.find(n=>n.id==='decomposition.call-2')!.name,/Call 1 · re-ask/);
  assert.equal(graph.nodes.find(n=>n.id==='matching.selector')?.calls.length,8);
  assert.deepEqual(graph.nodes.filter(n=>n.kind==='chunk').map(n=>n.name),['Call 2 · chunk 1/2','Call 2 · chunk 2/2']);
  const missing=loggingDetail({id,created_at:at(0),status:'success'},[entry('request',0,{}).jsonPayload,entry('llm',1,{stage:'nutrition',outputTokens:19,inputTokens:100}).jsonPayload,entry('final',2,{}).jsonPayload],1)!;
  assert.equal(missing.calls[0].startedAt,undefined);assert.equal(missing.calls[0].createdAt,undefined);
  assert.equal(buildGraph(missing as never).nodes.find(n=>n.kind==='selector')?.timingKnown,false);
});
