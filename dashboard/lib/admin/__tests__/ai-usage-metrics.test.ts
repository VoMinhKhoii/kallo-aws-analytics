import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { metricQuery } from '../live-metrics';
import type { MetricName } from '@/app/lib/types';

// Mirrors analytics.v_budget_events as Kallo's 20261015143620 migration defines it.
const SCHEMA = `
  SET TIME ZONE 'Asia/Tokyo';
  CREATE SCHEMA analytics;
  CREATE TABLE analytics.v_budget_events (
    id serial, created_at timestamptz, request_id text, route text, work_kind text, provider text, model text,
    request_count int, input_tokens int, output_tokens int, error_category text, cached_tokens int,
    thought_tokens int, cache_write_tokens int, cost_usd numeric(12,8), latency_ms int, fallback_from text);
`;

const COLS = 'created_at,request_id,route,work_kind,model,request_count,input_tokens,output_tokens,cached_tokens,thought_tokens,cost_usd,latency_ms,fallback_from,error_category';
const MEAL = "'/api/analyze-meal'";

const ROWS = `
  INSERT INTO analytics.v_budget_events (${COLS}) VALUES
  -- r1: Haiku answers. Reservation row + one priced attempt.
  ('2026-10-04T01:00:00Z','r1',${MEAL},'primary','claude-haiku-5-5',1,0,0,0,0,NULL,NULL,NULL,NULL),
  ('2026-10-04T01:00:01Z','r1',${MEAL},'primary','claude-haiku-5-5',0,3000,400,1000,0,0.0010,1000,NULL,NULL),
  -- r2: Haiku fails, Gemini stands in (one failed retry, then the answer).
  ('2026-10-04T02:00:00Z','r2',${MEAL},'primary','claude-haiku-5-5',1,0,0,0,0,NULL,NULL,NULL,NULL),
  ('2026-10-04T02:00:01Z','r2',${MEAL},'primary','claude-haiku-5-5',0,3000,0,0,0,0.0003,2000,NULL,'server_error'),
  ('2026-10-04T02:00:03Z','r2',${MEAL},'primary','gemini-3.1-flash-lite',0,5000,500,0,0,0.0020,3000,'claude-haiku-5-5','timeout'),
  ('2026-10-04T02:00:07Z','r2',${MEAL},'primary','gemini-3.1-flash-lite',0,5000,500,0,0,0.0020,4000,'claude-haiku-5-5',NULL),
  -- r3: an unpriced model; the analysis is left out of meal cost.
  ('2026-10-04T03:00:00Z','r3',${MEAL},'primary','mystery-model',0,100,10,0,0,NULL,500,NULL,NULL),
  -- Shadow work: counted per model, never in meal cost.
  ('2026-10-04T04:00:00Z','s1',${MEAL},'shadow','gemini-3.5-flash-lite',0,4000,400,0,0,0.0050,6000,NULL,NULL),
  -- Shadow work on a model that also serves primary traffic.
  ('2026-10-04T04:30:00Z','s2',${MEAL},'shadow','claude-haiku-5-5',0,100,10,0,0,0.0002,NULL,NULL,NULL),
  -- r5 starts just before the window and finishes inside it: filed under Oct 3, whole.
  ('2026-10-03T23:59:58Z','r5',${MEAL},'primary','gemini-2.5-flash',1,0,0,0,0,NULL,NULL,NULL,NULL),
  ('2026-10-04T00:00:02Z','r5',${MEAL},'primary','gemini-2.5-flash',0,100,10,0,0,0.0001,4000,NULL,NULL),
  -- r7: the only call times out before using tokens: a $0 meal, not unpriced.
  ('2026-10-04T07:00:00Z','r7',${MEAL},'primary','claude-haiku-5-5',0,0,0,0,0,NULL,NULL,NULL,'timeout'),
  -- r6 starts just before the window ends and finishes after it: counted whole.
  ('2026-10-04T23:59:58Z','r6',${MEAL},'primary','gemini-2.5-flash',1,0,0,0,0,NULL,NULL,NULL,NULL),
  ('2026-10-05T00:00:03Z','r6',${MEAL},'primary','gemini-2.5-flash',0,100,10,0,0,0.0007,4000,NULL,NULL),
  -- Old row from before per-call timing: no latency.
  ('2026-10-04T05:00:00Z','r4',${MEAL},'primary','gemini-3.1-flash-lite',0,1000,100,0,0,0.0004,NULL,NULL,NULL),
  -- Outside the window on both sides (UTC bounds while the session is in Tokyo).
  ('2026-10-03T23:59:59Z','r0',${MEAL},'primary','gemini-3.1-flash-lite',0,1,1,0,0,0.0001,10,NULL,NULL),
  ('2026-10-05T00:00:00Z','r9',${MEAL},'primary','gemini-3.1-flash-lite',0,1,1,0,0,0.0001,10,NULL,NULL);
`;

async function run(pg: PGlite, metric: MetricName) {
  const query = new PgDialect().sqlToQuery(metricQuery(metric, '2026-10-04', '2026-10-04'));
  return (await pg.query<Record<string, any>>(query.sql, query.params)).rows;
}

test('AI usage metrics count attempts, price, percentiles and fallbacks per model', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(SCHEMA + ROWS);
    const window = await run(pg, 'ai_model_window');
    const by = Object.fromEntries(window.map((r) => [r.model, r]));

    // Reservation rows are not calls; days outside the UTC window are excluded.
    assert.equal(by['claude-haiku-5-5'].calls, 4);
    assert.equal(by['gemini-3.1-flash-lite'].calls, 3);
    assert.equal(by['claude-haiku-5-5'].errors, 2);
    assert.equal(by['gemini-3.1-flash-lite'].errors, 1);

    // Spend is the sum of cost_usd; unpriced attempts are counted, not zeroed.
    assert.ok(Math.abs(by['gemini-3.1-flash-lite'].spend_usd - 0.0044) < 1e-9);
    assert.equal(by['mystery-model'].spend_usd, null);
    assert.equal(by['mystery-model'].unpriced_calls, 1);
    // A zero-token failure is $0, not unpriced.
    assert.equal(by['claude-haiku-5-5'].unpriced_calls, 0);
    assert.ok(Math.abs(by['claude-haiku-5-5'].spend_usd - 0.0015) < 1e-9);

    // Fallbacks are filed under the model that failed: only the answering attempt counts.
    assert.equal(by['claude-haiku-5-5'].fallbacks, 1);
    assert.equal(by['gemini-3.1-flash-lite'].fallbacks, 0);

    // Percentiles come from per-attempt latency; rows without timing are skipped.
    assert.equal(by['gemini-3.1-flash-lite'].timed_calls, 2);
    assert.equal(by['gemini-3.1-flash-lite'].p95_ms, 3950);
    assert.equal(by['claude-haiku-5-5'].p99_ms, 1990);

    assert.equal(by['gemini-3.5-flash-lite'].shadow, true);
    assert.equal(by['claude-haiku-5-5'].shadow, false);
    // Shadow spend is summed per attempt, also on a model that serves primary work.
    assert.equal(by['claude-haiku-5-5'].shadow_spend_usd, 0.0002);
    assert.equal(by['gemini-3.5-flash-lite'].shadow_spend_usd, 0.005);
    assert.equal(by['gemini-3.1-flash-lite'].shadow_spend_usd, null);
    assert.equal(by['claude-haiku-5-5'].cached_tokens, 1000);

    const daily = await run(pg, 'ai_usage_daily');
    assert.deepEqual([...new Set(daily.map((r) => r.date))], ['2026-10-04']);
    assert.equal(daily.find((r) => r.model === 'claude-haiku-5-5')!.fallbacks, 1);
  } finally {
    await pg.close();
  }
});

test('AI meal metrics sum each primary analysis and leave out unpriced ones', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(SCHEMA + ROWS);
    const [meal] = await run(pg, 'ai_meal_window');
    // r1–r4, r6 and r7 are primary analyses; s1/s2 are shadow; r0/r9 fall
    // outside; r5 started before the window, so its in-window tail is not a
    // meal; r6 started inside it, so its attempt after midnight still counts.
    assert.equal(meal.meals, 6);
    // Attempts only: r1 1, r2 3, r3 1, r4 1, r6 1, r7 1; reservations and shadow work stay out.
    assert.equal(meal.calls, 8);
    assert.equal(meal.priced_meals, 5);
    // r1 0.0010 + r2 (0.0003 + 0.0020 + 0.0020) + r4 0.0004 + r6 0.0007 + r7 0
    assert.ok(Math.abs(meal.spend_usd - 0.0064) < 1e-9);
    // Priced meal costs 0, 0.0004, 0.0007, 0.0010, 0.0043 → p95 by linear interpolation.
    assert.ok(Math.abs(meal.p95_meal_usd - 0.00364) < 1e-9);

    const daily = await run(pg, 'ai_meals_daily');
    assert.deepEqual(daily.map((r) => [r.date, r.meals]), [['2026-10-04', 6]]);
  } finally {
    await pg.close();
  }
});
