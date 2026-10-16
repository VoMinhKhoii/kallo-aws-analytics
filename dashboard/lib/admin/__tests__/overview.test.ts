import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { loadOverview } from '../overview';
test('overview uses durable reservations, complete UTC comparisons, honest error limits and rolling active users', async()=>{
  const pg=new PGlite(), dialect=new PgDialect();
  const db={async execute(query:SQL) {const q=dialect.sqlToQuery(query);return (await pg.query(q.sql,q.params)).rows;}} as unknown as AppDb;
  try {
    await pg.exec(`SET TIME ZONE 'Asia/Tokyo'; CREATE SCHEMA auth; CREATE SCHEMA analytics;
      CREATE TABLE auth.users(id uuid,created_at timestamptz);
      CREATE TABLE analysis_model_budget_events(request_id text,created_at timestamptz,route text,work_kind text,request_count int);
      CREATE TABLE pipeline_runs(created_at timestamptz,total_ms int,request_id text);
      CREATE TABLE pipeline_requests(id uuid,created_at timestamptz,status text,replay_of_request_id uuid,error_code text);
      CREATE TABLE user_feedback(created_at timestamptz,status text);
      CREATE TABLE analytics.v_meals(logged_at timestamptz,user_hash text);
      CREATE TABLE entitlement_grants(user_id uuid,status text,source text,environment text,entitlement_key text,starts_at timestamptz,expires_at timestamptz);
      INSERT INTO analysis_model_budget_events SELECT 'reservation',d,'/api/analyze-meal','primary',1 FROM generate_series('2026-04-01Z'::timestamptz,'2026-10-16Z',interval '1 day') d;
      INSERT INTO pipeline_runs SELECT d,1000,NULL::text FROM generate_series('2026-04-01Z'::timestamptz,'2026-10-16Z',interval '1 day') d;
      INSERT INTO analysis_model_budget_events VALUES ('shadow','2026-10-15Z','/api/analyze-meal','shadow',1),('attempt','2026-10-15Z','/api/analyze-meal','primary',0),('other','2026-10-15Z','/api/cheat','primary',1);
      INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','2026-10-15T23:30Z');
      INSERT INTO analytics.v_meals VALUES ('2026-10-15T23:30Z','a'),('2026-10-15T20:00Z','a'),('2026-10-10Z','b'),('2026-10-16Z','today');
      INSERT INTO pipeline_requests VALUES ('00000000-0000-4000-8000-000000000001','2026-10-16Z','error',NULL),('00000000-0000-4000-8000-000000000002','2026-10-16Z','error','00000000-0000-4000-8000-000000000001');
      -- Rejected non-meal input is the user's mistake, not a failed analysis: never counted.
      INSERT INTO pipeline_requests VALUES ('00000000-0000-4000-8000-000000000003','2026-10-16Z','error',NULL,'non_food_input');
      INSERT INTO user_feedback VALUES ('2026-10-10Z','open'),('2026-10-16Z','open'),('2026-10-10Z','resolved');
      INSERT INTO entitlement_grants VALUES ('00000000-0000-4000-8000-000000000001','active','promo','production','premium',now()-interval '1 day',now()+interval '2 days');`);
    for (const days of [7,30]) {
      const r=await loadOverview(db,days,new Date('2026-10-16T12:00Z'));
      assert.equal(r.kpis.meals.value,days); assert.equal(r.kpis.meals.comparisonValue,days); assert.equal(r.kpis.meals.previousValue,days);
      assert.equal(r.kpis.p95MealLatencyMs.value,1000); assert.equal(r.kpis.p95MealLatencyMs.previousValue,1000);
      assert.equal(r.kpis.errorRate.value,1/7);
      const retained=r.mealsDaily.filter(r=>r.errors!=null);
      assert.equal(retained.length,7);
      assert.equal(r.kpis.errorRate.value,retained.reduce((n,r)=>n+r.errors!,0)/retained.reduce((n,r)=>n+r.analysed,0)); assert.equal(r.kpis.errorRate.previousValue,null);
      assert.equal(r.kpis.dau.value,1); assert.equal(r.kpis.newSignups.value,1); assert.equal(r.kpis.openFeedback.value,2);
      assert.equal(r.mealsDaily.length,days); assert.equal(r.mealsDaily.at(-1)?.analysed,1);
      assert.equal(r.activeUsersDaily.at(-2)?.wau,2); assert.equal(r.activeUsersDaily.at(-1)?.dau,1);
      assert.equal(r.needsAttention.failedMealsToday,1); assert.equal(r.needsAttention.feedbackOpenOver48h,1); assert.equal(r.needsAttention.grantsEndingWithin3Days,1);
      if(days>7) assert.equal(r.mealsDaily[0].errors,null);
    }
    const rolling=await loadOverview(db,'24h',new Date('2026-10-16T12:15Z'));
    assert.equal(rolling.mealsDaily.length,25);
    assert.equal(rolling.mealsDaily[0].date,'2026-10-15T12:00:00.000Z');
    assert.equal(rolling.mealsDaily.at(-1)?.date,'2026-10-16T12:00:00.000Z');
    assert.equal(rolling.kpis.meals.value,1);
    assert.equal(rolling.kpis.meals.comparisonValue,1);
    assert.equal(rolling.kpis.meals.previousValue,1);
    assert.equal(rolling.kpis.errorRate.value,1);
    assert.equal(rolling.kpis.errorRate.value,rolling.mealsDaily.reduce((n,r)=>n+r.errors!,0)/rolling.mealsDaily.reduce((n,r)=>n+r.analysed,0));
    assert.equal(rolling.kpis.errorRate.previousValue,0);
    assert.equal(rolling.kpis.dau.value,1);
    assert.equal(rolling.mealsDaily.reduce((n,r)=>n+r.analysed,0),1);
    assert.deepEqual(rolling.activeUsersDaily.map(r=>r.date),['2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16']);
    assert.equal(rolling.activeUsersDaily[0].dau,1);
    assert.equal(rolling.activeUsersDaily.at(-1)?.wau,3);
    // The grid includes complete hours outside the rolling KPI bounds, and caps today's partial hour at now.
    await pg.exec(`INSERT INTO analysis_model_budget_events VALUES
      ('before-rolling','2026-10-15T12:05Z','/api/analyze-meal','primary',1),
      ('current-hour','2026-10-16T12:10Z','/api/analyze-meal','primary',1),
      ('after-now','2026-10-16T12:20Z','/api/analyze-meal','primary',1);`);
    const aligned=await loadOverview(db,'24h',new Date('2026-10-16T12:15Z'));
    assert.equal(aligned.kpis.meals.value,2);
    assert.equal(aligned.mealsDaily[0].analysed,1);
    assert.equal(aligned.mealsDaily.at(-1)?.analysed,1);
    assert.equal(aligned.mealsDaily.reduce((n,r)=>n+r.analysed,0),3);
    await pg.exec(`DELETE FROM analysis_model_budget_events WHERE request_id IN ('before-rolling','current-hour','after-now')`);
    await assert.rejects(()=>loadOverview(db,90),/Invalid date window/);
    await pg.exec(`INSERT INTO pipeline_requests VALUES ('00000000-0000-4000-8000-000000000003','2026-10-15Z','error',NULL);
      INSERT INTO pipeline_runs VALUES ('2026-10-15Z',9999999,'00000000-0000-4000-8000-000000000002');`);
    const replay=await loadOverview(db,30,new Date('2026-10-16T12:00Z'));
    assert.equal(replay.kpis.p95MealLatencyMs.value,1000);assert.equal(replay.kpis.errorRate.value,2/7);
    await pg.exec(`DELETE FROM pipeline_runs WHERE created_at>='2026-10-09Z' AND request_id IS NULL;
      INSERT INTO pipeline_runs SELECT d,9999999,'00000000-0000-4000-8000-000000000002' FROM generate_series('2026-10-09Z'::timestamptz,'2026-10-15Z',interval '1 day') d;`);
    const coverage=await loadOverview(db,7,new Date('2026-10-16T12:00Z'));
    assert.equal(coverage.kpis.p95MealLatencyMs.value,null);assert.equal(coverage.kpis.p95MealLatencyMs.previousValue,null);
    await pg.exec(`DELETE FROM analysis_model_budget_events WHERE created_at<'2026-10-10Z'; DELETE FROM pipeline_runs WHERE created_at<'2026-10-10Z'`);
    const sparse=await loadOverview(db,7,new Date('2026-10-16T12:00Z'));
    assert.equal(sparse.kpis.meals.previousValue,null); assert.equal(sparse.kpis.p95MealLatencyMs.previousValue,null);
  } finally {await pg.close();}
});
