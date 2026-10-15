import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthConfig, isSameOrigin, shouldUseSecureSessionCookies } from '../../auth-config';
import { createSessionToken, verifySessionToken, authorizeRequest } from '../../auth';
import { loginAllowed, readLoginBody, loginSchema } from '../../login-security';
import { GET as traceList } from '../../../app/api/traces/route';
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
  for (const response of [await traceList(reviewerRequest),await traceDetail(reviewerRequest,{params:Promise.resolve({id:'invalid'})}),await analytics(new Request('https://admin.kallo.fit/api/analytics?fn=traceDetail&id=invalid',{headers:{cookie:'kallo_session='+token}}))]) {
    assert.equal(response.status,403); assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const founder = createSessionToken('founder');
  const invalid = await traceList(new Request('https://admin.kallo.fit/api/traces?from=bad',{headers:{cookie:'kallo_session='+founder}}));
  assert.equal(invalid.status,400); assert.equal(invalid.headers.get('cache-control'),'no-store');
  const expired = createSessionToken('founder',1); assert.equal(verifySessionToken(expired),null);
});
