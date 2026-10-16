import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMappings } from '../../ingredient-mappings';
import type { IngredientMappingRow } from '@/app/lib/types';

test('multi-day mappings keep latest chosen and candidates together, even when unmatched', () => {
  const old: IngredientMappingRow = {date:'2026-10-03',rank:1,ingredient_query:'rice',decision_count:4,accepted_count:4,
    chosen:{food_id:'old',name:'Old',source:null,similarity:null},candidates:[{rank:1,food_id:'old',name:'Old',source:null,similarity:null}]};
  const latest: IngredientMappingRow = {...old,date:'2026-10-04',decision_count:1,accepted_count:0,
    chosen:null,candidates:[{rank:1,food_id:'new',name:'New',source:null,similarity:null}]};
  for (const rows of [[old,latest],[latest,old]]) {
    const result = aggregateMappings(rows)[0];
    assert.equal(result.decision_count,5); assert.equal(result.accepted_count,4);
    assert.equal(result.chosen,null); assert.deepEqual(result.candidates,latest.candidates);
    assert.equal(result.date,'2026-10-04');
  }
});

test('ingredient timestamp migration preserves decisions and filters an exact rolling interval', async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {PgDialect}=await import('drizzle-orm/pg-core');
  const {metricQuery}=await import('../live-metrics');
  const {readFile}=await import('node:fs/promises');
  const pg=new PGlite();
  try {
    await pg.exec(`CREATE SCHEMA analytics; CREATE SCHEMA extensions;
      CREATE FUNCTION extensions.hmac(text,text,text) RETURNS bytea LANGUAGE SQL AS 'SELECT convert_to($1,''UTF8'')';
      CREATE TABLE analytics.pepper(pepper text); INSERT INTO analytics.pepper VALUES ('synthetic');
      CREATE TABLE public.pipeline_requests(id uuid,created_at timestamptz);
      CREATE TABLE analytics.v_verdict_pool(request_id uuid,d date,gidx int,verdict text,sel int,pool int,cands jsonb,ing_name text,reject_reason text);
      INSERT INTO public.pipeline_requests VALUES
        ('00000000-0000-4000-8000-000000000001',now()-interval '2 hours'),
        ('00000000-0000-4000-8000-000000000002',now()-interval '25 hours');
      INSERT INTO analytics.v_verdict_pool SELECT id,(created_at AT TIME ZONE 'UTC')::date,0,'accepted',0,1,
        '[{"info":{"foodCompositionId":"rice","matchedName":"Synthetic rice","source":"catalog","similarity":0.95}}]'::jsonb,'Synthetic rice',NULL FROM public.pipeline_requests;`);
    const original=await readFile(new URL('../../../../supabase/migrations/20260830023432_ingredient_intelligence.sql',import.meta.url),'utf8');
    await pg.exec("SET search_path=public,extensions,analytics;"+original.slice(original.indexOf('CREATE OR REPLACE VIEW'),original.indexOf('COMMENT ON VIEW')));
    // Supabase roles (anon, authenticated) do not exist in PGlite: apply the view, not its grants.
    const timed=await readFile(new URL('../../../../supabase/migrations/20261016035816_ingredient_decisions_30d_with_time.sql',import.meta.url),'utf8');
    await pg.exec("SET search_path=public,extensions,analytics;"+timed.slice(timed.indexOf('CREATE OR REPLACE VIEW'),timed.indexOf('COMMENT ON VIEW')));
    const all=await pg.query<{occurred_at:string}>('SELECT occurred_at FROM analytics.v_ingredient_decisions');
    assert.equal(all.rows.length,2);assert.ok(all.rows.every(r=>r.occurred_at));
    const {rows:[{now}]}=await pg.query<{now:string}>('SELECT now()::text AS now');
    const to=new Date(now).toISOString(),from=new Date(Date.parse(to)-86400000).toISOString();
    const query=new PgDialect().sqlToQuery(metricQuery('ingredient_demand',from,to));
    const rows=(await pg.query<{count:number}>(query.sql,query.params)).rows;
    assert.equal(rows.reduce((n,r)=>n+r.count,0),1);
  } finally {await pg.close();}
});
