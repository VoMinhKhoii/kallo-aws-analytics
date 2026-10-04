import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { metricQuery } from '../live-metrics';
import { METRIC_NAMES, type MetricName } from '@/app/lib/types';

test('all thirteen SQL metrics preserve counts, dimensions, UTC bounds, and ranking rules', async () => {
  const pg = new PGlite();
  const dialect = new PgDialect();
  try {
    await pg.exec(`
      SET TIME ZONE 'Asia/Tokyo';
      CREATE SCHEMA analytics;
      CREATE TABLE analytics.v_meals (logged_at timestamptz,user_hash text,calories_kcal float,protein_g float,carbohydrate_g float,fat_g float);
      CREATE TABLE analytics.v_pipeline_runs (created_at timestamptz,model_call2 text,total_ms float,matched_count int,unmatched_count int,ingredient_count int);
      CREATE TABLE analytics.v_budget_events (created_at timestamptz,provider text,model text,error_category text,input_tokens int,output_tokens int);
      CREATE TABLE analytics.v_app_health (occurred_at timestamptz,platform text,event_name text,metric text,"check" text,route text,fatal boolean,duration_ms float);
      CREATE TABLE analytics.v_food_composition (id text,name_en text,type_en text,calories_kcal float,protein_g float,carbohydrate_g float,fat_g float);
      CREATE TABLE analytics.v_ingredient_decisions (occurred_on date,ingredient_query text,verdict text,reject_bucket text,pool_size int,selected_rank int,
        chosen_food_id text,chosen_name text,chosen_source text,chosen_similarity float,
        candidate_1_food_id text,candidate_1_name text,candidate_1_source text,candidate_1_similarity float,
        candidate_2_food_id text,candidate_2_name text,candidate_2_source text,candidate_2_similarity float,
        candidate_3_food_id text,candidate_3_name text,candidate_3_source text,candidate_3_similarity float);
      INSERT INTO analytics.v_meals VALUES
        ('2026-10-03T23:59:00Z','previous',100,10,10,5),
        ('2026-10-04T01:00:00Z','a',100,10,10,5),
        ('2026-10-04T23:59:00Z','a',200,20,20,10),
        ('2026-10-05T00:00:00Z','next',300,30,30,15);
      INSERT INTO analytics.v_pipeline_runs VALUES
        ('2026-10-04T23:00:00Z','model',100,3,1,5),('2026-10-04T23:30:00Z','model',300,1,0,2),
        ('2026-10-05T00:00:00Z','model',900,9,0,9);
      INSERT INTO analytics.v_budget_events VALUES
        ('2026-10-04T23:00:00Z','google','gemini-2.5-flash',NULL,1000000,1000000),
        ('2026-10-04T23:30:00Z','google','gemini-2.5-flash','timeout',0,0),
        ('2026-10-04T23:40:00Z','unknown','new-model',NULL,10,20);
      INSERT INTO analytics.v_app_health VALUES
        ('2026-10-04T23:00:00Z','ios','app_crashed',NULL,NULL,NULL,true,NULL),
        ('2026-10-04T23:00:00Z','ios','app_crashed',NULL,NULL,NULL,false,NULL),
        ('2026-10-04T23:00:00Z','web','api_request_failed',NULL,NULL,'meal_save',NULL,50),
        ('2026-10-04T23:00:00Z','web','health_check_failed',NULL,'auth_session',NULL,NULL,100),
        ('2026-10-04T23:00:00Z','android','performance_measured','app_startup',NULL,NULL,NULL,100),
        ('2026-10-04T23:10:00Z','android','performance_measured','app_startup',NULL,NULL,NULL,200000),
        ('2026-10-04T23:00:00Z','unknown','app_crashed',NULL,NULL,NULL,true,NULL),
        ('2026-10-04T23:00:00Z','web','unknown',NULL,NULL,NULL,NULL,10);
      INSERT INTO analytics.v_food_composition VALUES ('bad','Bad rice','rice',100,0,0,0),('good','Rice','rice',100,0,25,0);
      INSERT INTO analytics.v_ingredient_decisions (occurred_on,ingredient_query,verdict,reject_bucket,pool_size,selected_rank,chosen_food_id,chosen_name,chosen_source,chosen_similarity,candidate_1_name,candidate_1_food_id) VALUES
        ('2026-10-04','  Rice  ','accepted',NULL,3,1,'rice','Rice','catalog',0.95,'Rice','rice'),
        ('2026-10-04','Rice','accepted',NULL,3,1,'rice','Rice','catalog',0.95,'Rice','rice'),
        ('2026-10-04','Brown rice','accepted',NULL,3,2,'rice','Rice','catalog',0.9,'Rice','rice'),
        ('2026-10-04','Ghost','missing','missing',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        ('2026-10-04','Gap','unmatched',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        ('2026-10-04','ID only','missing','missing',1,NULL,NULL,NULL,NULL,NULL,NULL,'id-only'),
        ('2026-10-05','Rice','accepted',NULL,1,1,'rice','Rice','catalog',0.95,'Rice','rice');
    `);
    const results = new Map<MetricName, Record<string, any>[]>();
    for (const name of METRIC_NAMES) {
      const query = dialect.sqlToQuery(metricQuery(name, '2026-10-04', '2026-10-04'));
      results.set(name, (await pg.query<Record<string, any>>(query.sql, query.params)).rows);
    }
    assert.deepEqual(results.get('dau_wau'), [{date:'2026-10-04',dau:1,wau:2}]);
    const histogram = results.get('macro_distributions')!;
    for (const nutrient of ['calories_kcal','protein_g','carbohydrate_g','fat_g'])
      assert.equal(histogram.filter(r => r.nutrient === nutrient).reduce((n,r) => n+r.count,0),2);
    const latency = results.get('ai_latency')![0];
    assert.equal(latency.call_count,2); assert.equal(latency.p50_ms,200); assert.equal(latency.p95_ms,290);
    const failure = results.get('ai_failure_rate')!.find(r => r.provider === 'google')!;
    assert.equal(failure.event_count,2); assert.equal(failure.failure_count,1); assert.equal(failure.failure_rate,0.5);
    const cost = results.get('token_cost_daily')!;
    assert.equal(cost.find(r => r.model === 'gemini-2.5-flash')!.cost_usd,2.8);
    assert.equal(cost.find(r => r.model === 'new-model')!.pricing_known,false);
    const match = results.get('match_rate')![0];
    assert.equal(match.ingredient_count,7); assert.equal(match.unaccounted_count,2); assert.equal(match.match_rate,4/7);
    assert.deepEqual(results.get('implausible_foods')!.map(r => r.id),['bad']);
    assert.equal(results.get('implausible_foods')![0].reasons.length,3);
    const health = results.get('app_health')!;
    assert.equal(health.length,5);
    assert.deepEqual(health.filter(r => r.event_name === 'app_crashed').map(r => [r.dimension,r.dimension_value]).sort(),[['fatal','false'],['fatal','true']]);
    assert.equal(health.find(r => r.event_name === 'api_request_failed')!.dimension,'route');
    assert.equal(health.find(r => r.event_name === 'health_check_failed')!.dimension,'check');
    assert.equal(health.find(r => r.event_name === 'performance_measured')!.p95_ms,100);
    assert.equal(health[0].hour,'2026-10-04T23:00:00Z');
    assert.equal(results.get('ingredient_demand')!.find(r => r.ingredient_query === 'rice')!.count,2);
    assert.equal(results.get('ingredient_mappings')!.find(r => r.ingredient_query === 'rice')!.decision_count,2);
    assert.equal(results.get('ingredient_mappings')!.find(r => r.ingredient_query === 'id only')!.candidates[0].food_id,'id-only');
    assert.equal(results.get('ingredient_mappings')!.find(r => r.ingredient_query === 'ghost')!.chosen,null);
    const corpus = results.get('corpus_reverse_lookup')![0];
    assert.equal(corpus.decision_count,3); assert.equal(corpus.query_count,2); assert.deepEqual(corpus.query_examples,['rice','brown rice']);
    assert.deepEqual(results.get('ingredient_gaps')!.map(r => [r.ingredient_query,r.verdict,r.reject_bucket]),[['gap','unmatched','unmatched']]);
    const ranks = results.get('ingredient_rank_distribution')!;
    assert.equal(ranks.length,2); assert.equal(ranks.reduce((n,r) => n+r.count,0),3); assert.equal(ranks.reduce((n,r) => n+r.share,0),1);
    const twoDay = dialect.sqlToQuery(metricQuery('ingredient_mappings','2026-10-04','2026-10-05'));
    const mappings = (await pg.query<Record<string, any>>(twoDay.sql,twoDay.params)).rows;
    assert.equal(mappings.find(r => r.date === '2026-10-05')!.rank,1);
  } finally { await pg.close(); }
});
