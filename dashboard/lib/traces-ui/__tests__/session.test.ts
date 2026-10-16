import test from 'node:test';
import assert from 'node:assert/strict';
import { readSession, sessionSnapshot, retrySession } from '../../session-store';
import { apiFetch } from '../../api-fetch';
test('transport error is distinct from no session and Refresh retries session',async()=>{
  const original=globalThis.fetch;let attempts=0;
  globalThis.fetch=async()=>{attempts++;if(attempts===1)throw new Error('offline');return Response.json({role:'founder',expires_at:null});};
  try {
    await readSession();assert.match(sessionSnapshot().error??'',/offline/);
    await retrySession();assert.equal(sessionSnapshot().role,'founder');assert.equal(sessionSnapshot().error,null);assert.equal(attempts,2);
  }finally{globalThis.fetch=original;}
});
test('confirmed API 401 redirects to login preserving current path and query',async()=>{
  const original=globalThis.fetch;const oldWindow=globalThis.window;let redirect='';
  Object.assign(globalThis,{window:{location:{pathname:'/premium',search:'?tab=give',hash:'#review',assign:(url:string)=>{redirect=url;}}}});
  globalThis.fetch=async()=>new Response('',{status:401});
  try{await apiFetch('/api/admin/premium');assert.equal(redirect,'/login?next=%2Fpremium%3Ftab%3Dgive%23review');}
  finally{globalThis.fetch=original;Object.assign(globalThis,{window:oldWindow});}
});
