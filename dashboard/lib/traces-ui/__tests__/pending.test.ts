import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshPending, pendingEligible } from '../pending';
import type { TraceSummary } from '../../traces/types';
const now=Date.parse('2026-10-16T10:00Z');
const row=(id:string,age=1000)=>({id,status:'pending',createdAt:new Date(now-age).toISOString()}) as TraceSummary;
test('lightweight batch polling covers appended pages and preserves terminal rows',async()=>{
  const original=globalThis.fetch,urls:string[]=[];
  globalThis.fetch=async url=>{urls.push(String(url));return Response.json({rows:[{id:'appended',status:'success',durationMs:4200,error:null}],missing:[]});};
  try {
    const rows=[{...row('finished'),status:'success'},row('appended')];
    const result=await refreshPending(rows,new AbortController().signal,now);
    assert.equal(result.failed,false);assert.equal(result.rows[0],rows[0]);assert.equal(result.rows[1].status,'success');assert.equal(result.rows[1].durationMs,4200);
    assert.equal(urls[0],'/api/traces/status?ids=appended');assert.ok(urls[1].includes('summary=1'));
  }finally{globalThis.fetch=original;}
});
test('expires abandoned pending rows after ten minutes and stops on deleted IDs/404',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('',{status:404});};
  try {
    assert.equal(pendingEligible(row('old',600000),now),false);
    const result=await refreshPending([row('old',600001),row('deleted')],new AbortController().signal,now);
    assert.deepEqual(result.rows.map(r=>r.id),['old']);assert.equal(calls,1);
    await refreshPending(result.rows,new AbortController().signal,now);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
test('one failed batch preserves successful row updates and missing tombstones',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('r50')?Response.json({error:'failure'},{status:502}):Response.json({rows:[{id:'r0',status:'success'}],missing:['r1']});
  try {
    const result=await refreshPending(Array.from({length:51},(_,i)=>row(`r${i}`)),new AbortController().signal,now);
    assert.equal(result.failed,true);assert.equal(result.rows[0].status,'success');assert.ok(!result.rows.some(r=>r.id==='r1'));assert.equal(result.rows.at(-1)?.status,'pending');
  }finally{globalThis.fetch=original;}
});

test('terminal transition fetches full summary with active filters and removes rows that no longer match',async()=>{
  const original=globalThis.fetch,urls:string[]=[];
  globalThis.fetch=async url=>{urls.push(String(url));return String(url).includes('summary=1')?Response.json({rows:[],missing:['done']}):Response.json({rows:[{id:'done',status:'success'}],missing:[]});};
  try {
    const result=await refreshPending([row('done')],new AbortController().signal,now,'w=24h&status=pending');
    assert.deepEqual(result.rows,[]);
    assert.ok(urls.some(url=>url.includes('summary=1')&&url.includes('status=pending')));
  }finally{globalThis.fetch=original;}
});
test('terminal summary replaces all stale metrics and failed summary remains retryable',async()=>{
  const original=globalThis.fetch;
  let fail=false;
  globalThis.fetch=async url=>String(url).includes('summary=1')?(fail?Response.json({}, {status:502}):Response.json({rows:[{...row('done'),status:'success',kcal:600,models:['new'],costUsd:.02}],missing:[]})):Response.json({rows:[{id:'done',status:'success'}],missing:[]});
  try {
    let result=await refreshPending([row('done')],new AbortController().signal,now);
    assert.equal(result.rows[0].kcal,600);assert.deepEqual(result.rows[0].models,['new']);
    fail=true;result=await refreshPending([row('done')],new AbortController().signal,now);
    assert.equal(result.failed,true);assert.equal(result.rows[0].status,'pending');
  }finally{globalThis.fetch=original;}
});
