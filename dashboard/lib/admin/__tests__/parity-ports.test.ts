import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { loadPipelineHealth } from '../health';
import { listPrompts, promptHistory } from '../../prompts/catalog';

async function database(setup: string) {
  const pg = new PGlite(); const dialect = new PgDialect();
  await pg.exec(setup);
  const db = { async execute(query: SQL) { const q = dialect.sqlToQuery(query); return (await pg.query(q.sql, q.params)).rows; } } as unknown as AppDb;
  return { db, close: () => pg.close() };
}

test('pipeline health: replays and non-meal input are left out; percentiles come from pipeline_runs', async () => {
  const { db, close } = await database(`
    CREATE TABLE pipeline_requests (id uuid PRIMARY KEY, created_at timestamptz, status text, error text, error_code text, replay_of_request_id uuid);
    CREATE TABLE pipeline_runs (request_id text, created_at timestamptz, total_ms int);
    INSERT INTO pipeline_requests VALUES
      ('00000000-0000-4000-8000-000000000001', now() - interval '1 hour', 'success', NULL, NULL, NULL),
      ('00000000-0000-4000-8000-000000000002', now() - interval '2 hours', 'error', 'Call 1 timed out', 'timeout', NULL),
      ('00000000-0000-4000-8000-000000000003', now() - interval '3 hours', 'error', 'not food', 'non_food_input', NULL),
      ('00000000-0000-4000-8000-000000000004', now() - interval '3 days', 'success', NULL, NULL, NULL),
      ('00000000-0000-4000-8000-000000000005', now() - interval '4 days', 'error', 'older timeout', 'timeout', NULL),
      ('00000000-0000-4000-8000-000000000006', now() - interval '1 hour', 'error', 'replayed', 'timeout', '00000000-0000-4000-8000-000000000002');
    INSERT INTO pipeline_runs VALUES ('00000000-0000-4000-8000-000000000001', now() - interval '1 hour', 1000),
      ('x', now() - interval '2 hours', 3000), ('00000000-0000-4000-8000-000000000006', now() - interval '1 hour', 99000),
      ('y', now() - interval '2 days', 50000);`);
  try {
    const h = await loadPipelineHealth(db);
    assert.deepEqual(h.success, [
      { window: '24h', succeeded: 1, failed: 1, rate: 0.5 },
      { window: '7d', succeeded: 2, failed: 2, rate: 0.5 },
    ]);
    assert.equal(h.latency24h.runs, 2);
    assert.equal(h.latency24h.p50, 2000);
    // Non-meal input is still listed as an error code, just not counted as a failure.
    assert.deepEqual(h.topErrors.map(e => [e.code, e.count, e.sample]), [['timeout', 2, 'Call 1 timed out'], ['non_food_input', 1, 'not food']]);
  } finally { await close(); }
});

test('pipeline health with no traffic reads as unknown, not zero', async () => {
  const { db, close } = await database(`CREATE TABLE pipeline_requests (id uuid, created_at timestamptz, status text, error text);
    CREATE TABLE pipeline_runs (request_id text, created_at timestamptz, total_ms int);`);
  try {
    const h = await loadPipelineHealth(db);
    assert.deepEqual(h.success.map(s => s.rate), [null, null]);
    assert.deepEqual(h.latency24h, { p50: null, p95: null, p99: null, runs: 0 });
    assert.deepEqual(h.topErrors, []);
  } finally { await close(); }
});

test('prompts catalog: newest-first names and per-prompt history', async () => {
  const { db, close } = await database(`
    CREATE TABLE prompt_versions (id uuid PRIMARY KEY, name text, code_hash text, template_sample text, model text, git_sha text, first_seen_at timestamptz);
    INSERT INTO prompt_versions VALUES
      ('00000000-0000-4000-8000-0000000000a1', 'decomposition-grounded', 'hash1', 'rule a', 'gemini', 'sha1', '2026-10-01T00:00:00Z'),
      ('00000000-0000-4000-8000-0000000000a2', 'decomposition-grounded', 'hash2', 'rule b', 'gemini', NULL, '2026-10-20T00:00:00Z'),
      ('00000000-0000-4000-8000-0000000000b1', 'grounded-estimation', 'hash3', 'est', 'gemini', 'sha3', '2026-10-10T00:00:00Z');`);
  try {
    assert.deepEqual(await listPrompts(db), [
      { name: 'decomposition-grounded', versions: 2, latestSeenAt: '2026-10-20T00:00:00.000Z' },
      { name: 'grounded-estimation', versions: 1, latestSeenAt: '2026-10-10T00:00:00.000Z' },
    ]);
    const history = await promptHistory(db, 'decomposition-grounded');
    assert.deepEqual(history.map(v => [v.codeHash, v.gitSha, v.templateSample]), [['hash2', null, 'rule b'], ['hash1', 'sha1', 'rule a']]);
    assert.deepEqual(await promptHistory(db, 'missing'), []);
  } finally { await close(); }
});
