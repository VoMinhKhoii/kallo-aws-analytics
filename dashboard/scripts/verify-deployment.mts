import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import dns from 'node:dns/promises';

// No production writes: only reads, login/logout, previews and invalid requests.
if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local','utf8').trim().split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const at = line.indexOf('='); if (at < 1) continue;
  const raw = line.slice(at + 1);
  try { process.env[line.slice(0,at)] = JSON.parse(raw); } catch { process.env[line.slice(0,at)] = raw; }
}
const base = process.env.ADMIN_TEST_URL || 'https://admin.kallo.fit';
const resolver = new dns.Resolver(); resolver.setServers(['1.1.1.1']);
const addresses = await resolver.resolve4(new URL(base).hostname);
const agent = new https.Agent({ family: 4, lookup: (_host, _options, callback) => callback(null, addresses[0], 4) });
async function request(path: string, cookie?: string, payload?: unknown, origin = base) {
  return await new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: any }>((resolve,reject) => {
    const req = https.request(base + path, { agent, method: payload ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { Origin: origin, 'Content-Type': 'application/json' } : {}) } }, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => { let body; try { body = JSON.parse(text); } catch { body = text; } resolve({ status: res.statusCode || 0, headers: res.headers, body }); });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out'))); req.on('error',reject);
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
async function login(role: 'FOUNDER' | 'REVIEWER') {
  const r = await request('/api/auth/login', undefined, { username: process.env[`DASHBOARD_${role}_USERNAME`], password: process.env[`DASHBOARD_${role}_PASSWORD`] });
  assert.equal(r.status,200); const set = r.headers['set-cookie']?.[0]; assert.ok(set?.includes('HttpOnly') && set.includes('Secure'));
  return set.split(';')[0];
}
assert.equal((await request('/api/admin/premium')).status,401);
assert.equal((await request('/')).status,307);
console.log('Anonymous access blocked; custom-domain TLS verified.');
const founder = await login('FOUNDER');
for (const path of ['/api/admin/status','/api/admin/overview?days=7','/api/admin/premium','/api/admin/records?kind=requests','/api/admin/records?kind=feedback']) {
  const r = await request(path,founder); assert.equal(r.status,200,path); assert.ok(!r.body.error); console.log('PASS',path);
}
const query = encodeURIComponent(process.env.ADMIN_EMAILS?.split(',')[0].trim() || 'kallo');
const search = await request('/api/admin/premium?search='+query,founder); assert.equal(search.status,200); assert.ok(search.body.length);
const account = await request('/api/admin/premium?account='+search.body[0].id,founder); assert.equal(account.status,200); assert.ok(Array.isArray(account.body.grants));
const preview = await request('/api/admin/premium',founder,{ action:'preview',input:{ kind:'users',userIds:[search.body[0].id] } });assert.equal(preview.status,200);assert.equal(typeof preview.body.accounts,'number');
console.log('PASS account search, grants, and nonmutating preview.');
for (const days of [7,30,90]) {
  const overview = await request('/api/admin/overview?days='+days,founder);
  assert.equal(overview.status,200);
  assert.equal(overview.body.trend.length,days);
  assert.equal(overview.body.summary.requests,overview.body.trend.reduce((n: number,r: { requests: number }) => n+r.requests,0));
  assert.equal(overview.body.summary.errors,overview.body.trend.reduce((n: number,r: { errors: number }) => n+r.errors,0));
}
for (const kind of ['requests','feedback']) {
  const statuses = kind === 'requests' ? ['success','error','pending'] : ['open','triaged','resolved','wontfix'];
  for (const status of statuses) {
    const records = await request(`/api/admin/records?kind=${kind}&status=${status}`,founder);
    assert.equal(records.status,200);
    assert.ok(records.body.rows.every((row: { status: string }) => row.status===status));
    assert.ok(records.body.rows.length<=30);
  }
  assert.equal((await request(`/api/admin/records?kind=${kind}&page=2`,founder)).status,200);
}
for (const path of ['/','/premium','/requests','/feedback','/analytics','/ai','/ingredients','/system','/trace']) {
  const page = await request(path,founder);
  assert.equal(page.status,200,path); assert.ok(String(page.body).includes('Kallo admin'));
}
console.log('PASS UTC summary/chart agreement, filters, pagination, and every workspace route.');
const requests = await request('/api/admin/records?kind=requests',founder);
if (requests.body.rows.length) { const detail = await request('/api/admin/records?kind=requests&id='+requests.body.rows[0].id,founder);assert.equal(detail.status,200); assert.ok(Array.isArray(detail.body.stages)); }
const to=new Date().toISOString().slice(0,10);const from=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
const names='dau_wau,macro_distributions,ai_latency,ai_failure_rate,token_cost_daily,match_rate,implausible_foods,app_health,ingredient_demand,ingredient_mappings,corpus_reverse_lookup,ingredient_gaps,ingredient_rank_distribution';
const metrics=await request(`/api/metrics?metrics=${names}&from=${from}&to=${to}`,founder);assert.equal(metrics.status,200);assert.deepEqual(metrics.body.errors,{});assert.equal(Object.keys(metrics.body.data).length,13);
for (const row of metrics.body.data.dau_wau) assert.ok(row.dau>=0 && row.wau>=row.dau);
for (const row of metrics.body.data.ai_failure_rate) assert.ok(row.failure_count<=row.event_count && row.failure_rate>=0 && row.failure_rate<=1);
for (const row of metrics.body.data.ai_latency) assert.ok(row.p50_ms<=row.p95_ms && row.p95_ms<=row.p99_ms);
for (const row of metrics.body.data.ingredient_rank_distribution) assert.ok(row.share>0 && row.share<=1 && row.selected_rank<=row.pool_size);
const monitoring=await request(`/api/cloud-monitoring?from=${from}&to=${to}`,founder);assert.equal(monitoring.status,200);assert.ok(monitoring.body.series.length);assert.equal(monitoring.body.delivery_source,'cloudflare-direct');
const rpc=await request('/api/analytics?fn=requestsPage&range=7d',founder);assert.equal(rpc.status,200);
console.log('PASS all 13 metrics, Google Monitoring, bounded trace RPC, request inspection.');
const invalid = { action:'give', input:{ who:{kind:'everyone'},length:{unit:'days',days:14},mode:'extend',reason:'Validation only'} };
assert.equal((await request('/api/admin/premium',founder,invalid)).status,400);
for (const payload of [{action:'end',input:{who:{kind:'everyone'},reason:'Validation only',confirm:'EVERYONE'}},{action:'offer',input:{enabled:true,days:366,reason:'Validation only'}},{action:'undo',input:{id:'invalid',reason:'Validation only'}}])
  assert.equal((await request('/api/admin/premium',founder,payload)).status,400);
assert.equal((await request('/api/admin/records',founder,{id:'00000000-0000-4000-8000-000000000000',status:'triaged'})).status,404);
assert.equal((await request('/api/admin/records',founder,{id:'invalid',status:'triaged'})).status,400);
assert.equal((await request(`/api/metrics?metrics=${names}&from=2026-02-30&to=${to}`,founder)).status,400);
assert.equal((await request(`/api/cloud-monitoring?from=${to}&to=${from}`,founder)).status,400);
assert.equal((await request('/api/admin/premium',founder,{action:'preview',input:{kind:'everyone'}},'https://attacker.example')).status,403);
const reviewer=await login('REVIEWER');
assert.equal((await request('/api/admin/premium',reviewer)).status,403);
assert.equal((await request('/api/admin/records?kind=feedback',reviewer)).status,403);
assert.equal((await request('/api/admin/premium',reviewer,{action:'preview',input:{kind:'everyone'}})).status,403);
assert.equal((await request(`/api/metrics?metrics=ai_latency&from=${from}&to=${to}`,reviewer)).status,200);
console.log('PASS reviewer permissions, typed confirmation, and CSRF protection.');
for (const cookie of [founder,reviewer]) assert.equal((await request('/api/auth/logout',cookie,{})).status,200);
console.log('Deployment verification passed. No business records changed.');
