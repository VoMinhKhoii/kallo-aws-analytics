import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthConfig, isSameOrigin, shouldUseSecureSessionCookies } from '../../auth-config';
import { createSessionToken, verifySessionToken, authorizeRequest } from '../../auth';
import { loginAllowed, readLoginBody, loginSchema } from '../../login-security';
import { GET as traceList } from '../../../app/api/traces/route';
import { GET as traceStatuses } from '../../../app/api/traces/status/route';
import { GET as tracePayload } from '../../../app/api/traces/[id]/payload/route';
import { GET as traceDetail } from '../../../app/api/traces/[id]/route';
import { GET as analytics } from '../../../app/api/analytics/route';
import { POST } from '../../../app/api/auth/login/route';
const config = { DASHBOARD_FOUNDER_USERNAME: ' owner ', DASHBOARD_FOUNDER_PASSWORD: ' secret with spaces ', DASHBOARD_SESSION_SECRET: 's'.repeat(40) };
test('founder-only configuration preserves credential bytes; partial reviewer is disabled', () => {
  const c = getAuthConfig(config);
  assert.equal(c.configured,true); assert.equal(c.founderPassword,config.DASHBOARD_FOUNDER_PASSWORD);
  assert.equal(c.founderUsername,' owner '); assert.equal(c.reviewerUsername,'');
  assert.equal(getAuthConfig({...config,DASHBOARD_REVIEWER_USERNAME:'reviewer'}).configured,true);
  assert.equal(shouldUseSecureSessionCookies({ NODE_ENV:'production',DASHBOARD_COOKIE_SECURE:'false' }),true);
});
test('fixed origins reject forwarded and arbitrary same-host origins', () => {
  assert.equal(isSameOrigin(new Request('https://evil.test',{headers:{origin:'https://evil.test','x-forwarded-host':'evil.test','x-forwarded-proto':'https'}})),false);
  assert.equal(isSameOrigin(new Request('https://admin.kallo.fit',{headers:{origin:'https://admin.kallo.fit'}})),true);
  assert.equal(isSameOrigin(new Request('https://admin.kallo.fit')),false);
  assert.equal(isSameOrigin(new Request('https://kallo-admin.minhkhoitdn.workers.dev',{headers:{origin:'https://kallo-admin.minhkhoitdn.workers.dev'}})),true);
});
test('stream body enforces byte bounds without Content-Length; Zod rejects bad credentials shape', async () => {
  const body = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('界'.repeat(3000))); c.close(); }});
  await assert.rejects(readLoginBody(new Request('http://localhost',{method:'POST',body,duplex:'half'} as RequestInit)),RangeError);
  assert.equal(loginSchema.safeParse({username:1,password:'x'}).success,false);
});
test('optional login limits allow local requests, present limits reject exhausted keys', async () => {
  const request = new Request('https://admin.kallo.fit',{headers:{'cf-connecting-ip':'192.0.2.1'}});
  assert.equal(await loginAllowed(request,{}),true);
  let key = '';
  assert.equal(await loginAllowed(request,{LOGIN_RATE_LIMITER:{async limit(v) {key=v.key;return {success:false};}}}),false);
  assert.equal(key,'login:192.0.2.1');
  assert.equal(await loginAllowed(request,{LOGIN_GLOBAL_LIMITER:{async limit(){return {success:false};}}}),false);
});
test('login works without reviewer secrets, wrong password is generic, founder routes reject reviewer', async t => {
  const previous = {...process.env}; Object.assign(process.env,config);
  delete process.env.DASHBOARD_REVIEWER_USERNAME; delete process.env.DASHBOARD_REVIEWER_PASSWORD;
  t.after(() => { for (const k of Object.keys(process.env)) if (!(k in previous)) delete process.env[k]; Object.assign(process.env,previous); });
  const login = (password: string) => POST(new Request('https://admin.kallo.fit/api/auth/login',{method:'POST',headers:{origin:'https://admin.kallo.fit'},body:JSON.stringify({username:config.DASHBOARD_FOUNDER_USERNAME,password})}));
  assert.equal((await login('wrong password')).status,401);
  const result = await login(config.DASHBOARD_FOUNDER_PASSWORD);
  assert.equal(result.status,200); assert.match(result.headers.get('set-cookie')!,/HttpOnly/);
  const token = createSessionToken('reviewer');
  assert.equal(verifySessionToken(token)?.role,'reviewer');
  const access = authorizeRequest(new Request('https://admin.kallo.fit/api/traces',{headers:{cookie:'kallo_session='+token}}),{role:'founder'});
  assert.ok('response' in access); if ('response' in access) assert.equal(access.response.status,403);
  const reviewerRequest = new Request('https://admin.kallo.fit/api/traces',{headers:{cookie:'kallo_session='+token}});
  for (const response of [await traceList(reviewerRequest),await traceStatuses(reviewerRequest),await tracePayload(reviewerRequest,{params:Promise.resolve({id:'invalid'})}),await traceDetail(reviewerRequest,{params:Promise.resolve({id:'invalid'})}),await analytics(new Request('https://admin.kallo.fit/api/analytics?fn=traceDetail&id=invalid',{headers:{cookie:'kallo_session='+token}}))]) {
    assert.equal(response.status,403); assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const founder = createSessionToken('founder');
  const invalid = await traceList(new Request('https://admin.kallo.fit/api/traces?from=bad',{headers:{cookie:'kallo_session='+founder}}));
  assert.equal(invalid.status,400); assert.equal(invalid.headers.get('cache-control'),'no-store');
  const expired = createSessionToken('founder',1); assert.equal(verifySessionToken(expired),null);
});

test('explicit extra origins and local-only insecure cookie override work in production', async t => {
  const previous={...process.env}; Object.assign(process.env,config,{NODE_ENV:'production',DASHBOARD_EXTRA_ORIGINS:'http://127.0.0.1:43123, https://example.test/path, https://trusted.test',DASHBOARD_COOKIE_SECURE:'false'});
  t.after(()=>{for(const k of Object.keys(process.env)) if(!(k in previous)) delete process.env[k];Object.assign(process.env,previous);});
  assert.equal(isSameOrigin(new Request('http://127.0.0.1:43123',{headers:{origin:'http://127.0.0.1:43123'}})),true);
  assert.equal(isSameOrigin(new Request('http://127.0.0.1:43124',{headers:{origin:'http://127.0.0.1:43124','x-forwarded-host':'127.0.0.1:43123'}})),false);
  assert.equal(isSameOrigin(new Request('https://example.test',{headers:{origin:'https://example.test'}})),false);
  assert.equal(shouldUseSecureSessionCookies(process.env,'http://localhost:43123'),false);
  assert.equal(shouldUseSecureSessionCookies(process.env,'http://127.0.0.1:43123'),false);
  assert.equal(shouldUseSecureSessionCookies(process.env,'https://trusted.test'),true);
  assert.equal(shouldUseSecureSessionCookies({DASHBOARD_COOKIE_SECURE:'true'},'http://localhost'),true);
  const result=await POST(new Request('http://127.0.0.1:43123/api/auth/login',{method:'POST',headers:{origin:'http://127.0.0.1:43123'},body:JSON.stringify({username:config.DASHBOARD_FOUNDER_USERNAME,password:config.DASHBOARD_FOUNDER_PASSWORD})}));
  assert.equal(result.status,200); assert.doesNotMatch(result.headers.get('set-cookie')!,/; Secure/);
});

test('production limiter failures fail closed; only local development may omit bindings',async()=>{
  const previous=process.env.NODE_ENV;
  Object.assign(process.env,{NODE_ENV:'production'});
  const request=new Request('https://admin.example.test/api/auth/login');
  const yes={async limit(){return {success:true};}},no={async limit(){return {success:false};}},broken={async limit():Promise<{success:boolean}>{throw new Error('unavailable');}};
  try {
    await assert.rejects(loginAllowed(request,{}),/Sign-in is temporarily unavailable/);
    await assert.rejects(loginAllowed(request,{LOGIN_RATE_LIMITER:yes,LOGIN_GLOBAL_LIMITER:broken}),/Sign-in is temporarily unavailable/);
    await assert.rejects(loginAllowed(request,{LOGIN_RATE_LIMITER:broken,LOGIN_GLOBAL_LIMITER:yes}),/Sign-in is temporarily unavailable/);
    assert.equal(await loginAllowed(request,{LOGIN_RATE_LIMITER:yes,LOGIN_GLOBAL_LIMITER:yes}),true);
    assert.equal(await loginAllowed(request,{LOGIN_RATE_LIMITER:yes,LOGIN_GLOBAL_LIMITER:no}),false);
    assert.equal(await loginAllowed(new Request('http://localhost:3000'),{}),true);
    Object.assign(process.env,{NODE_ENV:'development'});assert.equal(await loginAllowed(request,{}),true);
  }finally{if(previous===undefined)delete (process.env as Record<string,string|undefined>).NODE_ENV;else Object.assign(process.env,{NODE_ENV:previous});}
});

test('production login route returns retryable 503 when Worker limit bindings are unavailable',async t=>{
  const previous={...process.env};Object.assign(process.env,config,{NODE_ENV:'production'});
  t.after(()=>{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);});
  const response=await POST(new Request('https://admin.kallo.fit/api/auth/login',{method:'POST',headers:{origin:'https://admin.kallo.fit'},body:JSON.stringify({username:config.DASHBOARD_FOUNDER_USERNAME,password:config.DASHBOARD_FOUNDER_PASSWORD})}));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'Sign-in is temporarily unavailable');assert.equal(response.headers.get('set-cookie'),null);
});
