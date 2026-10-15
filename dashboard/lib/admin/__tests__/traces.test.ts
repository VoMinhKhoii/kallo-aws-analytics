import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { traceFilters, listQuery, encodeCursor, decodeCursor, listTraces } from '../../traces/query';
import { traceRequest, loadPostgresDetail } from '../../traces/postgres';
import { loggingDetail, reassemble, loadLoggingDetail } from '../../traces/logging';
import { generateKeyPairSync } from 'node:crypto';
const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const request = {id,created_at:'2026-10-10T10:00:00Z',status:'success',raw_input:'Synthetic rice bowl',duration_ms:1000};
const e = (type: string, seq: number, payload: object = {}) => ({kind:'kallo_trace_v1',requestId:id,eventId:'event-'+seq,seq,type,part:1,parts:1,...payload});
test('signed cursors bind filters and reject tampering', () => {
  const f = traceFilters.parse({from:'2026-10-10',to:'2026-10-10'});
  const cursor = encodeCursor(request.created_at,id,f,'test-secret');
  assert.equal(decodeCursor(cursor,f,'test-secret').id,id);
  assert.throws(() => decodeCursor(cursor,{...f,q:'different'},'test-secret'));
  assert.throws(() => decodeCursor(cursor+'x',f,'test-secret'));
  assert.equal(traceFilters.safeParse({from:'2026-02-30',to:'2026-10-10'}).success,false);
});
test('chunk reassembly tolerates order and duplicates; incomplete chunks and markers report truncation', () => {
  const text = JSON.stringify({rawInput:'Synthetic 🍚 bowl'}), split = 15;
  const first = {...e('request',1),parts:2,payload:text.slice(0,split)};
  const second = {...first,part:2,payload:text.slice(split)};
  assert.equal(reassemble([second,first,first],id).events[0].rawInput,'Synthetic 🍚 bowl');
  assert.equal(reassemble([second],id).truncated,true);
  assert.equal(reassemble([e('final',2,{truncated:true})],id).truncated,true);
});
test('Logging normalizes summaries, stages, all attempts, gaps and partial captures', () => {
  const entries = [e('request',1,{rawInput:'Synthetic bowl',profile:'balanced'}),
    e('stage',2,{stage:'decomposition',index:0,startedAt:request.created_at,durationMs:100,status:'success'}),
    e('llm',3,{stage:'decomposition',model:'claude-test',attempt:1,inputTokens:20,costUsd:0.01,response:'synthetic response'}),
    e('stage',4,{stage:'assembly',index:3,startedAt:'2026-10-10T10:00:00.300Z',durationMs:100,status:'success'}),
    e('final',5,{summary:{kcal:{low:90,mid:100,high:110},items:[{name:'Synthetic bowl',grams:100,kcal:100}]}})];
  const detail = loggingDetail(request,entries,1)!;
  assert.equal(detail.source,'logging'); assert.equal(detail.calls[0].provider,'anthropic');
  assert.equal(detail.stages[0].calls[0],'event-3'); assert.equal(detail.gaps[0].ms,200);
  assert.deepEqual(detail.summary.kcal,{low:90,mid:100,high:110}); assert.equal(detail.completeness.truncated,false);
  assert.equal(loggingDetail(request,entries.slice(0,-1),1)!.completeness.truncated,true);
});
test('Postgres list and detail work before and after summary expansion with tied timestamp paging', async () => {
  const pg = new PGlite(); const dialect = new PgDialect();
  const db = { async execute(query: SQL) { const q = dialect.sqlToQuery(query); return (await pg.query(q.sql,q.params)).rows; } } as unknown as AppDb;
  try {
    await pg.exec(`
      CREATE TABLE pipeline_requests(id uuid,created_at timestamptz,status text,raw_input text,duration_ms int,error text);
      CREATE TABLE pipeline_stage_logs(id uuid,request_id uuid,stage text,stage_index int,created_at timestamptz,duration_ms int,status text,error text,input_json jsonb,output_json jsonb);
      CREATE TABLE prompt_versions(id uuid,template_sample text);
      CREATE TABLE pipeline_llm_calls(id uuid,request_id uuid,stage_log_id uuid,created_at timestamptz,model text,attempt int,latency_ms int,input_tokens int,output_tokens int,error text,prompt_version_id uuid,prompt_rendered text,response_raw text);
      CREATE TABLE pipeline_llm_call_metadata(llm_call_id uuid,provider text,cached_tokens int,thought_tokens int);
      CREATE TABLE pipeline_runs(request_id text,created_at timestamptz,total_ms int,pipeline_version text);
      CREATE TABLE analysis_model_budget_events(id uuid,request_id text,created_at timestamptz,model text,provider text,request_count int,input_tokens int,output_tokens int,cached_tokens int,thought_tokens int,cache_write_tokens int,cost_usd numeric,latency_ms int,fallback_from text,error_category text);
      INSERT INTO pipeline_requests VALUES ('${id}','2026-10-10T10:00:00.123456Z','success','Synthetic rice bowl',1000,NULL),('${otherId}','2026-10-10T10:00:00.123456Z','error','Synthetic soup',900,'synthetic failure');
      INSERT INTO pipeline_stage_logs VALUES ('${id}','${id}','assembly',3,'2026-10-10T10:00:01.123456Z',100,'success',NULL,'{}','{"result":{"mealItems":[{"name":"Synthetic bowl","ingredients":[{"estimatedGrams":100}]}],"displayedNutrition":{"caloriesKcal":100,"proteinG":5}}}');
      INSERT INTO prompt_versions VALUES ('${id}','synthetic template');
      INSERT INTO pipeline_llm_calls VALUES ('${id}','${id}','${id}','2026-10-10T10:00:00Z','gemini-test',1,100,20,10,NULL,'${id}',NULL,'synthetic response');
      INSERT INTO pipeline_llm_call_metadata VALUES ('${id}','google',5,2);
      INSERT INTO analysis_model_budget_events VALUES ('${id}','${id}','2026-10-10T10:00:00Z','gemini-test','google',0,20,10,5,2,0,0.01,100,NULL,NULL),('${otherId}','${id}','2026-10-10T10:00:00Z','claude-test','anthropic',0,15,10,0,0,0,0.02,80,NULL,NULL);
    `);
    const f = traceFilters.parse({from:'2026-10-10',to:'2026-10-10',limit:1});
    const first = await listTraces(db,f,'secret'); assert.equal(first.items[0].id,otherId); assert.ok(first.nextCursor);
    const second = await listTraces(db,{...f,cursor:first.nextCursor!},'secret');
    assert.equal(second.items[0].id,id); assert.equal(second.items[0].calls,2); assert.equal(second.items[0].kcal,100); assert.equal(second.nextCursor,null);
    assert.equal((await listTraces(db,{...f,status:'success',q:'rice'},'secret')).items[0].id,id);
    assert.equal((await listTraces(db,{...f,q:'%'},'secret')).items.length,0);
    const row = await traceRequest(db,id); const detail = await loadPostgresDetail(db,row!);
    assert.equal(detail.calls.length,2); assert.equal(detail.calls[0].prompt,'synthetic template');
    assert.equal(detail.calls[0].cachedTokens,5); assert.equal(detail.summary.kcal,100); assert.equal(detail.summary.items[0].grams,100);
    assert.equal(detail.completeness.callsBilled,2); assert.equal(detail.completeness.callsLogged,1);
    await pg.exec(`UPDATE pipeline_llm_calls SET response_raw=repeat('x',800000) WHERE id='${id}'`);
    const truncated = await loadPostgresDetail(db,row!);
    assert.equal(truncated.completeness.truncated,true); assert.equal(truncated.calls[0].response,undefined);
    await pg.exec(`ALTER TABLE pipeline_requests ADD COLUMN meal_name text; UPDATE pipeline_requests SET meal_name='Expanded name' WHERE id='${id}';`);
    const result = await db.execute(listQuery({...f,q:'Expanded'},new Set(['meal_name'])));
    assert.equal(result[0].meal_name,'Expanded name');
  } finally { await pg.close(); }
});
test('Logging follows empty continuation pages, uses Logging scope, and falls back on forbidden/quota', async t => {
  const old = globalThis.fetch, previous = process.env.GOOGLE_MONITORING_CREDENTIALS;
  process.env.GOOGLE_MONITORING_CREDENTIALS = JSON.stringify({client_email:'synthetic@example.test',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
  t.after(() => {globalThis.fetch=old; if(previous===undefined) delete process.env.GOOGLE_MONITORING_CREDENTIALS; else process.env.GOOGLE_MONITORING_CREDENTIALS=previous;});
  let pages=0, fail=0;
  globalThis.fetch = async (url, init) => {
    if(String(url).includes('oauth2')) {
      const assertion = new URLSearchParams(String(init?.body)).get('assertion')!;
      assert.equal(JSON.parse(Buffer.from(assertion.split('.')[1],'base64url').toString()).scope,'https://www.googleapis.com/auth/logging.read');
      return Response.json({access_token:'synthetic'});
    }
    if(fail) return new Response('',{status:fail});
    pages++; const body = JSON.parse(String(init?.body)); assert.match(body.filter,/cloud_run_revision/);
    return pages===1 ? Response.json({entries:[],nextPageToken:'next'}) : Response.json({entries:[{jsonPayload:e('request',1)},{jsonPayload:e('final',2,{summary:{kcal:100}})}]});
  };
  assert.equal((await loadLoggingDetail(request,0))?.source,'logging'); assert.equal(pages,2);
  for (const status of [403,404,429,500]) { fail=status; assert.equal(await loadLoggingDetail(request,0),null); }
});

test('Logging deadline returns fallback even if the transport ignores abort', async t => {
  const old = globalThis.fetch, previous = process.env.GOOGLE_MONITORING_CREDENTIALS;
  process.env.GOOGLE_MONITORING_CREDENTIALS = JSON.stringify({client_email:'deadline@example.test',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
  t.after(() => {globalThis.fetch=old; if(previous===undefined) delete process.env.GOOGLE_MONITORING_CREDENTIALS; else process.env.GOOGLE_MONITORING_CREDENTIALS=previous;});
  globalThis.fetch = url => String(url).includes('oauth2') ? Promise.resolve(Response.json({access_token:'deadline-test'})) : new Promise(() => {});
  const start = Date.now(); assert.equal(await loadLoggingDetail(request,0),null);
  assert.ok(Date.now()-start >= 4900 && Date.now()-start < 8000);
});
