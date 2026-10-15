import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshPending } from '../pending';
import type { TraceSummary } from '../../traces/types';
test('polls pending requests on appended pages and preserves terminal rows and order',async()=>{
  const original=globalThis.fetch;const urls:string[]=[];
  globalThis.fetch=async url=>{urls.push(String(url));return Response.json({status:'success',error:null,errorCode:null,durationMs:4200,summary:{kcal:{low:100,mid:120,high:140},items:[{}]},calls:[{costUsd:null}]});};
  try {
    const rows=[{id:'finished',status:'success'},{id:'appended-pending',status:'pending'}] as TraceSummary[];
    const result=await refreshPending(rows,new AbortController().signal);
    assert.equal(result[0],rows[0]);assert.equal(result[1].id,'appended-pending');assert.equal(result[1].status,'success');assert.equal(result[1].kcalMid,120);assert.equal(result[1].costUsd,null);assert.deepEqual(urls,['/api/traces/appended-pending?refresh=1']);
  } finally {globalThis.fetch=original;}
});
test('failed pending refresh preserves the API error for Retry',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'Synthetic RPC failure'},{status:502});
  try {await assert.rejects(refreshPending([{id:'pending',status:'pending'}] as TraceSummary[],new AbortController().signal),/Synthetic RPC failure/);}finally{globalThis.fetch=original;}
});
