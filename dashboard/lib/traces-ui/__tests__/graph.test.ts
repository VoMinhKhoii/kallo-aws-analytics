import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TraceGraphDetail } from '../../traces/types';
import { adjacentStep,buildGraph,gapWindow,timeOrder,classifyCall } from '../graph';
const at=(ms:number)=>new Date(Date.UTC(2026,0,1)+ms).toISOString();
function fixture():TraceGraphDetail {return {id:'00000000-0000-4000-8000-000000000001',source:'postgres',createdAt:at(0),status:'error',errorCode:'synthetic_failure',error:'Synthetic failure',durationMs:10000,rawInput:'Synthetic meal',mealName:'Synthetic meal',profile:null,summary:{kcal:null,protein:null,carbs:null,fat:null,items:[]},stages:[{key:'stage-1',name:'decomposition',index:0,startedAt:at(1000),durationMs:1000,status:'success',error:null,stats:{},inputBytes:30,outputBytes:100,calls:['call-a']},{key:'stage-3',name:'nutrition',index:2,startedAt:at(6000),durationMs:2000,status:'success',error:null,stats:{},inputBytes:100,outputBytes:200,calls:['call-b','call-c']}],calls:[],gaps:[],completeness:{stagesExpected:4,stagesFound:2,callsLogged:0,callsBilled:0,truncated:false}};}
function call(id:string,start:number,role:TraceGraphDetail['calls'][number]['role']='call1',extra:Partial<TraceGraphDetail['calls'][number]>={}):TraceGraphDetail['calls'][number] {return {id,stage:null,attempt:1,provider:'synthetic',model:'model-a',startedAt:at(start),latencyMs:500,inputTokens:100,cachedTokens:0,cacheWriteTokens:0,outputTokens:role==='call2_chunk'||role.startsWith('rescue')?500:20,thoughtTokens:0,costUsd:.001,error:null,fallbackFrom:null,promptVersionId:null,role,hasPrompt:false,hasResponse:false,...extra};}
test('missing stages are ghosts and request failure remains visible with green stages',()=>{const g=buildGraph(fixture());assert.equal(g.nodes.find(n=>n.id==='matching')?.kind,'ghost');assert.equal(g.nodes.find(n=>n.id==='assembly')?.kind,'ghost');assert.equal(g.nodes.find(n=>n.id==='response')?.status,'error');assert.equal(g.nodes.find(n=>n.id==='decomposition')?.status,'success');assert.equal(g.nodes.find(n=>n.id==='decomposition')?.payloadKey,'stage-1');});
test('gap uses the largest uncovered wall-clock interval on the spine',()=>{const gap=gapWindow(fixture());assert.deepEqual(gap,{start:2000,ms:4000,after:'decomposition'});assert.equal(buildGraph(fixture()).nodes.some(n=>n.kind==='gap'),false);assert.equal(buildGraph(fixture()).edges.find(e=>e.source==='decomposition')?.label,'unaccounted 4.0 s');});
test('overlapping stage windows never invent a negative gap',()=>{const f=fixture();f.durationMs=2000;f.stages=f.stages.map(s=>({...s,startedAt:at(0),durationMs:2000}));assert.equal(gapWindow(f).ms,0);});
test('nutrition calls have ordered chunk nodes and after-response and unattributed are groups',()=>{const f=fixture();f.calls=[call('call-a',1000),call('call-b',6000,'call2_chunk',{error:'synthetic_provider_error'}),call('call-c',6500,'call2_chunk',{attempt:2,model:'model-b',fallbackFrom:'model-a'}),call('late',11000,'unknown',{afterResponse:true}),call('orphan',5000,'unknown')];const g=buildGraph(f);assert.deepEqual(g.nodes.find(n=>n.id==='nutrition.chunk-1')?.calls,['call-b']);assert.deepEqual(g.nodes.find(n=>n.id==='nutrition.chunk-2')?.calls,['call-c']);assert.equal(g.nodes.filter(n=>n.kind==='chunk').length,2);assert.equal(g.nodes.find(n=>n.id==='after-response')?.calls.length,1);assert.equal(g.nodes.find(n=>n.id==='unattributed')?.calls.length,1);assert.deepEqual(buildGraph(f),g);});
test('selectors and rescues have no individual child nodes',()=>{const f=fixture();f.calls=[call('s1',3000,'selector'),call('s2',3200,'selector'),call('r1',7000,'rescue_call1'),call('r2',7500,'rescue_call2')];const g=buildGraph(f);assert.equal(g.nodes.find(n=>n.id==='matching.selector')?.calls.length,2);assert.deepEqual(g.nodes.find(n=>n.id==='rescue-1')?.calls,['r1','r2']);assert.equal(g.nodes.filter(n=>n.kind==='attempt').length,0);assert.equal(g.edges.find(e=>e.source==='rescue-1'&&e.target==='assembly')?.dashed,true);});
test('time navigation clamps at boundaries and visits all steps deterministically',()=>{const nodes=buildGraph(fixture()).nodes;const order=timeOrder(nodes);for(let i=0;i<order.length-1;i++)assert.equal(adjacentStep(nodes,order[i].id,1),order[i+1].id);assert.equal(adjacentStep(nodes,order[0].id,-1),order[0].id);assert.equal(adjacentStep(nodes,order.at(-1)!.id,1),order.at(-1)!.id);});
test('unknown pricing never becomes free',()=>{const f=fixture();f.calls=[call('a',1000,'call1',{costUsd:null})];f.stages[0].calls=['a'];assert.equal(buildGraph(f).nodes.find(n=>n.id==='decomposition')?.cost,null);});
test('29 legacy attempts form compact groups and each call appears once off the spine',()=>{const f=fixture();f.status='success';f.durationMs=16000;f.stages=[{...f.stages[0],startedAt:at(0),durationMs:5500},{...f.stages[1],startedAt:at(5530),durationMs:5780}];f.calls=[call('decomp',0,'unknown',{outputTokens:1454,inputTokens:11382,latencyMs:5500}),...Array.from({length:14},(_,i)=>call(`selector-${i}`,5600+i*50,'unknown',{inputTokens:1500,outputTokens:19})),...Array.from({length:6},(_,i)=>call(`orphan-${i}`,12000+i*10,'unknown')),...Array.from({length:8},(_,i)=>call(`late-${i}`,17000+i*100,'unknown'))];const g=buildGraph(f);assert.equal(g.nodes.find(n=>n.id==='matching.selector')?.calls.length,14);assert.equal(g.nodes.filter(n=>n.kind==='chunk').length,0);assert.equal(g.nodes.find(n=>n.id==='unattributed')?.calls.length,6);assert.equal(g.nodes.find(n=>n.id==='after-response')?.calls.length,8);const callIds=g.nodes.filter(n=>!['stage','ghost'].includes(n.kind)).flatMap(n=>n.calls);assert.equal(callIds.length,29);assert.equal(new Set(callIds).size,29);const ids=new Set(g.nodes.map(n=>n.id));for(const e of g.edges){assert.ok(ids.has(e.source));assert.ok(ids.has(e.target));}assert.ok(g.nodes.length<16);});
test('legacy classification respects timing, token shape and explicit roles',()=>{const f=fixture();f.stages.push({...f.stages[0],name:'matching',startedAt:at(3000),durationMs:1000});assert.equal(classifyCall(call('s',3200,'unknown'),f),'selector');assert.equal(classifyCall(call('n',6500,'unknown',{outputTokens:500}),f),'call2_chunk');assert.equal(classifyCall(call('s2',6500,'unknown'),f),'selector');assert.equal(classifyCall(call('c1',1000,'unknown',{outputTokens:1000}),f),'call1');assert.equal(classifyCall(call('late',11000,'unknown'),f),'afterResponse');assert.equal(classifyCall(call('missing',5000,'unknown'),f),'unknown');assert.equal(classifyCall(call('nulls',6500,'unknown',{inputTokens:null,outputTokens:null}),f),'unknown');assert.equal(classifyCall(call('explicit',6500,'rescue_selector'),f),'rescue_selector');assert.equal(classifyCall(call('legacy-adapter',6500,'call2_chunk',{stage:'stage-3',outputTokens:19}),f),'selector');});
test('gap is a dashed edge label, Request is absent, spine pitch is 250 and >3 chunks group',()=>{
  const f=fixture();let g=buildGraph(f);
  assert.ok(!g.nodes.some(n=>['gap','request'].includes(n.kind)));
  assert.ok(g.edges.some(e=>e.source==='decomposition'&&e.target==='matching'&&e.dashed&&e.label==='unaccounted 4.0 s'));
  const spine=g.nodes.filter(n=>['stage','ghost','response'].includes(n.kind));
  for(let i=1;i<spine.length;i++)assert.equal(spine[i].position.x-spine[i-1].position.x,250);
  f.durationMs=2000;f.stages=[{...f.stages[0],startedAt:at(0),durationMs:1700}];
  assert.ok(!buildGraph(f).edges.some(e=>e.label));
  f.durationMs=10000;f.calls=Array.from({length:13},(_,i)=>call(`chunk-${i}`,6000+i*100,'call2_chunk'));
  g=buildGraph(f);const chunks=g.nodes.filter(n=>n.kind==='chunk');
  assert.equal(chunks.length,1);assert.equal(chunks[0].name,'Call 2 ×13');assert.equal(chunks[0].calls.length,13);assert.equal(chunks[0].position.y,132);
});

test('Postgres shape recovery overrides every backend role at the 64 token boundary',()=>{
  const f=fixture();
  for(const role of ['unknown','call2_chunk','call1','rescue_selector'] as const) {
    assert.equal(classifyCall(call(role,6500,role,{outputTokens:64,inputTokens:3999}),f),'selector');
  }
  assert.equal(classifyCall(call('large-input',6500,'unknown',{outputTokens:64,inputTokens:4000}),f),'unknown');
  assert.equal(classifyCall(call('large-output',6500,'unknown',{outputTokens:65}),f),'call2_chunk');
  f.source='logging';
  assert.equal(classifyCall(call('explicit',6500,'rescue_selector',{outputTokens:19}),f),'rescue_selector');
});
test('stats drive stage subtitles and errors remain visible with successful stages',()=>{
  const f=fixture();f.errorCode='no_macro_data';
  f.stages[0].stats={mealItemCount:5,ingredientCount:12};
  f.stages.push({...f.stages[0],key:'matching',name:'matching',stats:{ingredientCount:12,matchedCount:10,unmatchedCount:2}});
  f.stages[1].stats={chunkCount:2,failedChunkCount:0};
  f.calls=[call('selector',6500,'call2_chunk',{outputTokens:19}),call('chunk1',6800,'call2_chunk'),call('chunk2',7200,'call2_chunk',{latencyMs:0})];
  const g=buildGraph(f),node=(id:string)=>g.nodes.find(n=>n.id===id)!;
  assert.equal(node('decomposition').count,'5 items · 12 ingr');
  assert.equal(node('matching').count,'12 ingr · 10 matched');assert.equal(node('matching').warning,' · 2 unmatched');
  assert.equal(node('nutrition').count,'2 chunks');assert.equal(g.nodes.filter(n=>n.kind==='chunk').length,2);
  assert.equal(node('matching.selector').name,'Selector ×1');assert.equal(node('nutrition.chunk-2').duration,null);
  assert.match(node('response').count,/error · no_macro_data/);assert.ok(!g.nodes.some(n=>n.id==='request'));
  assert.ok(!g.nodes.some(n=>n.count.includes('details in panel')));
});

test('after response uses request origin, dropped status and compact unattributed row',()=>{
  const f=fixture();f.durationMs=16400;f.calls=[call('late',31000,'unknown',{afterResponse:true,latencyMs:300}),call('orphan',5000,'unknown')];
  const g=buildGraph(f),after=g.nodes.find(n=>n.id==='after-response')!;
  assert.equal(after.status,'dropped');assert.equal(after.count,'finished +31.3 s · 14.9 s after response');
  assert.equal(g.nodes.find(n=>n.id==='unattributed')?.position.y,228);
});
