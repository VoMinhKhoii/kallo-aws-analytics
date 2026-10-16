import test from 'node:test';
import assert from 'node:assert/strict';
import { loggingDetail } from '../../traces/logging';
import { postgresDetail } from '../../traces/normalize';
import { buildGraph, callStart, classifyCall, timelineEnd } from '../graph';
const id='00000000-0000-4000-8000-000000000001';
const at=(ms:number)=>new Date(Date.parse('2026-10-16T12:00:00Z')+ms).toISOString();
const entry=(type:string,seq:number,body:object,ms=seq*1000):{timestamp:string;jsonPayload:Record<string,unknown>}=>({timestamp:at(ms),jsonPayload:{kind:'kallo_trace_v1',requestId:id,eventId:`event-${seq}`,seq,type,part:1,parts:1,...body}});
test('Logging meal shapes recover selectors, re-asks, ordered chunks and call start offsets',()=>{
  const entries=[entry('request',0,{}),entry('stage',1,{stage:'decomposition',index:0,startedAt:at(0),durationMs:3000,status:'success'}),entry('stage',2,{stage:'nutrition',index:2,startedAt:at(3000),durationMs:20000,status:'success'}),
    entry('llm',3,{stage:'decomposition',model:'synthetic',attempt:1,latencyMs:500}),entry('llm',4,{stage:'decomposition',model:'synthetic',attempt:2,latencyMs:500},3400),
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

test('Logging rescue mini-meal uses production 73a8c32f timings without doubling the request axis',()=>{
  const origin=Date.parse('2026-10-16T03:07:09.823Z');
  const stamp=(offset:number)=>new Date(origin+offset).toISOString();
  const event=(type:string,seq:number,end:number,body:object)=>({...entry(type,seq,body),timestamp:stamp(end)});
  const llm=(seq:number,end:number,stage:string,latencyMs:number,outputTokens:number,response:object)=>event('llm',seq,end,{stage,model:'synthetic',latencyMs,inputTokens:1500,outputTokens,response});
  const entries=[event('request',1,0,{rawInput:'Synthetic dinner'}),
    llm(2,4314,'decomposition',4276,785,{mealItems:[{name:'Synthetic dinner'}]}),
    event('stage',3,4396,{stage:'decomposition',index:0,startedAt:stamp(33),durationMs:4364}),
    event('stage',4,4709,{stage:'matching',index:1,startedAt:stamp(4406),durationMs:301}),
    ...[[5,5675,959],[6,5696,980],[7,5713,998],[8,5727,1012],[9,5932,1218],[10,5987,1272],[12,6601,925],[13,7344,1150]].map(([seq,end,latency])=>llm(seq,end,'nutrition',latency,19,{ranking:[0]})),
    llm(11,6192,'decomposition',1786,219,{mealItems:[{name:'Synthetic stew'}]}),
    llm(14,7553,'nutrition',1358,166,{mealItems:[{name:'Synthetic stew'}]}),
    llm(15,9038,'nutrition',4318,1028,{mealItems:[{name:'Synthetic dinner'}]}),
    event('stage',16,9040,{stage:'nutrition',index:2,startedAt:stamp(4717),durationMs:4323}),
    event('stage',17,9154,{stage:'assembly',index:3,startedAt:stamp(9044),durationMs:108}),
    event('final',18,9251,{durationMs:9226,status:'success'})];
  const detail=loggingDetail({id,created_at:stamp(200),status:'success'},entries,12)!;
  assert.equal(detail.createdAt,stamp(0));
  const pgStages=entries.filter(e=>e.jsonPayload.type==='stage').map(e=>({
    id:e.jsonPayload.stage,stage:e.jsonPayload.stage,stage_index:e.jsonPayload.index,
    created_at:e.timestamp,duration_ms:e.jsonPayload.durationMs,
    status:'success',input_json:{},output_json:{},
  }));
  const pgCalls=entries.filter(e=>e.jsonPayload.type==='llm').map(e=>({
    id:e.jsonPayload.eventId,stage_log_id:e.jsonPayload.stage,created_at:e.timestamp,
    model:'synthetic',latency_ms:e.jsonPayload.latencyMs,input_tokens:1500,
    output_tokens:e.jsonPayload.outputTokens,response_raw:JSON.stringify(e.jsonPayload.response),
  }));
  const postgres=postgresDetail({id,created_at:stamp(0),duration_ms:9226,status:'success'},pgStages,pgCalls,[]);
  assert.deepEqual(postgres.calls.map(c=>[c.id,c.role]).sort(),detail.calls.map(c=>[c.id,c.role]).sort());
  const roles=detail.calls.map(c=>c.role);
  for(const [role,count] of [['call1',1],['selector',8],['call2_chunk',1],['rescue_call1',1],['rescue_call2',1]] as const)assert.equal(roles.filter(r=>r===role).length,count,role);
  // Exercise the response-free graph contract too.
  const graphDetail={...detail,calls:detail.calls.map(({response,prompt,...c})=>c)} as never;
  for(const c of detail.calls)assert.equal(classifyCall(c,graphDetail),c.role);
  const offset=(seq:number)=>callStart(detail.calls.find(c=>c.id===`event-${seq}`)!,origin);
  assert.equal(offset(15),4720);assert.equal(offset(11),4406);assert.equal(offset(14),6195);
  const graph=buildGraph(graphDetail);
  assert.deepEqual(graph.nodes.filter(n=>n.kind==='chunk').map(n=>n.name),['Call 2']);
  assert.equal(graph.nodes.find(n=>n.id==='nutrition')?.count,'1 chunk');
  assert.deepEqual(graph.nodes.find(n=>n.kind==='rescue')?.calls,['event-11','event-14']);
  assert.equal(graph.nodes.find(n=>n.kind==='rescue')?.name,'Rescue · Synthetic stew');
  assert.ok(graph.edges.some(e=>e.source==='nutrition'&&e.target==='rescue-1'));
  assert.ok(!graph.nodes.some(n=>n.name.includes('re-ask')));
  assert.equal(timelineEnd(graph.nodes,detail.durationMs!),9226);
  assert.ok(Math.abs(timelineEnd(graph.nodes,detail.durationMs!)-9251)<30);
});
