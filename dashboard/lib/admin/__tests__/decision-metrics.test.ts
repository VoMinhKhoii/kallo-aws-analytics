import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { readDecisionMetric } from '../decision-metrics';
import type { TraceDb } from '../../traces/d1';

// The real trace-ingest schema on SQLite, the engine D1 runs.
function store() {
  const lite = new DatabaseSync(':memory:');
  lite.exec(readFileSync(new URL('../../../../trace-ingest/migrations/0001_trace_store.sql', import.meta.url), 'utf8'));
  // node:sqlite binds ?1/?2 by name, D1 by position: adapt.
  const db: TraceDb = { prepare: (query) => ({ bind: (...values) => ({ all: async <T,>() => ({ results: lite.prepare(query).all(Object.fromEntries(values.map((v, i) => [i + 1, v])) as never) as T[] }) }) }) };
  let n = 0;
  const add = (d: Partial<Record<string, unknown>> & { request_id: string; verdict: string; ingredient_query: string | null }) => {
    const row = { gidx: n++, occurred_at: '2026-10-22T03:00:00.000Z', occurred_on: '2026-10-22', received_at: 0, pool_size: 0, ...d };
    const keys = Object.keys(row);
    lite.prepare(`INSERT INTO ingredient_decisions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...(Object.values(row) as never[]));
  };
  return { db, add };
}

const cand = (k: number, id: string, name: string, sim: number | null) => ({ [`candidate_${k}_food_id`]: id, [`candidate_${k}_name`]: name, [`candidate_${k}_source`]: 'usda', [`candidate_${k}_similarity`]: sim });
const egg = { pool_size: 2, ...cand(1, 'egg_raw', 'Egg, raw', 0.9), ...cand(2, 'egg_boiled', 'Egg, boiled', null), chosen_food_id: 'egg_raw', chosen_name: 'Egg, raw', chosen_source: 'usda', chosen_similarity: 0.9 };

test('demand counts queries per day and ranks by count', async () => {
  const { db, add } = store();
  for (const r of ['a', 'b', 'c']) add({ request_id: r, verdict: 'accepted', ingredient_query: 'egg', selected_rank: 1, ...egg });
  add({ request_id: 'd', verdict: 'unmatched', ingredient_query: 'rau răm' });
  add({ request_id: 'e', verdict: 'accepted', ingredient_query: 'x'.repeat(161) });
  add({ request_id: 'f', verdict: 'accepted', ingredient_query: 'egg', occurred_on: '2026-10-23', occurred_at: '2026-10-23T01:00:00.000Z' });
  assert.deepEqual(await readDecisionMetric(db, 'ingredient_demand', '2026-10-22', '2026-10-22'), [
    { date: '2026-10-22', ingredient_query: 'egg', count: 3, rank: 1 },
    { date: '2026-10-22', ingredient_query: 'rau răm', count: 1, rank: 2 },
  ]);
  // An hourly window reads occurred_at, whatever offset the caller writes.
  const hourly = await readDecisionMetric(db, 'ingredient_demand', '2026-10-23T07:00:00+07:00', '2026-10-23T09:00:00+07:00');
  assert.deepEqual(hourly.map(r => [r.date, r.ingredient_query, r.count]), [['2026-10-23', 'egg', 1]]);
});

test('gaps link the latest trace and bucket reject reasons', async () => {
  const { db, add } = store();
  add({ request_id: 'early', verdict: 'rejected', ingredient_query: 'nước mắm', reject_bucket: 'low_confidence', occurred_at: '2026-10-22T01:00:00.000Z' });
  add({ request_id: 'late', verdict: 'rejected', ingredient_query: 'nước mắm', reject_bucket: 'low_confidence', occurred_at: '2026-10-22T09:00:00.000Z' });
  add({ request_id: 'u', verdict: 'unmatched', ingredient_query: 'rau răm', reject_bucket: 'unmatched' });
  add({ request_id: 'ok', verdict: 'accepted', ingredient_query: 'egg' });
  assert.deepEqual(await readDecisionMetric(db, 'ingredient_gaps', '2026-10-22', '2026-10-22'), [
    { date: '2026-10-22', ingredient_query: 'nước mắm', verdict: 'rejected', reject_bucket: 'low_confidence', count: 2, last_seen: '2026-10-22T09:00:00.000Z', last_trace_id: 'late', rank: 1 },
    { date: '2026-10-22', ingredient_query: 'rau răm', verdict: 'unmatched', reject_bucket: 'unmatched', count: 1, last_seen: '2026-10-22T03:00:00.000Z', last_trace_id: 'u', rank: 2 },
  ]);
});

test('rank distribution shares are per day and pool size', async () => {
  const { db, add } = store();
  add({ request_id: 'a', verdict: 'accepted', ingredient_query: 'egg', pool_size: 2, selected_rank: 1 });
  add({ request_id: 'b', verdict: 'accepted', ingredient_query: 'egg', pool_size: 2, selected_rank: 1 });
  add({ request_id: 'c', verdict: 'accepted', ingredient_query: 'egg', pool_size: 2, selected_rank: 2 });
  add({ request_id: 'd', verdict: 'accepted', ingredient_query: 'egg', pool_size: 2, selected_rank: 3 });
  const rows = await readDecisionMetric(db, 'ingredient_rank_distribution', '2026-10-22', '2026-10-22');
  assert.deepEqual(rows.map(r => [r.pool_size, r.selected_rank, r.count, Math.round(Number(r.share) * 1000) / 1000]), [[2, 1, 2, 0.667], [2, 2, 1, 0.333]]);
});

test('reverse lookup and mappings decode their JSON columns', async () => {
  const { db, add } = store();
  for (const [r, q] of [['a', 'egg'], ['b', 'egg'], ['c', 'trứng'], ['d', 'eggs'], ['e', 'egg raw'], ['f', 'quả trứng'], ['g', 'egg white']])
    add({ request_id: r, verdict: 'accepted', ingredient_query: q, selected_rank: 1, ...egg });
  const [food] = await readDecisionMetric(db, 'corpus_reverse_lookup', '2026-10-22', '2026-10-22');
  assert.equal(food.decision_count, 7);
  assert.equal(food.query_count, 6);
  // Five examples, most frequent first, then by text.
  assert.deepEqual(food.query_examples, ['egg', 'egg raw', 'egg white', 'eggs', 'quả trứng']);
  const [mapping] = await readDecisionMetric(db, 'ingredient_mappings', '2026-10-22', '2026-10-22');
  assert.equal(mapping.ingredient_query, 'egg');
  assert.equal(mapping.decision_count, 2);
  assert.equal(mapping.accepted_count, 2);
  assert.deepEqual(mapping.chosen, { food_id: 'egg_raw', name: 'Egg, raw', source: 'usda', similarity: 0.9 });
  // Null members stay inside a kept candidate; an all-null candidate is left out.
  assert.deepEqual(mapping.candidates, [
    { rank: 1, food_id: 'egg_raw', name: 'Egg, raw', source: 'usda', similarity: 0.9 },
    { rank: 2, food_id: 'egg_boiled', name: 'Egg, boiled', source: 'usda', similarity: null },
  ]);
});
