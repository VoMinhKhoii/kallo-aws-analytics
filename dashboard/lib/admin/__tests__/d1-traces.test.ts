import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { d1Entries, type TraceDb } from '../../traces/d1';
import { loggingDetail } from '../../traces/logging';
import { captureIncomplete, graphDetail, nodePayload } from '../../traces/detail';

const id = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-0000000000aa';
const request = { id, created_at: '2026-10-25T10:00:00Z', status: 'success', raw_input: 'Synthetic rice bowl', duration_ms: 1000 };
const line = (type: string, seq: number, payload: object = {}) => JSON.stringify({ kind: 'kallo_trace_v1', requestId: id, eventId: 'event-' + seq, seq, type, part: 1, parts: 1, ...payload });
const rows = [
  { body: line('request', 1, { rawInput: 'Synthetic rice bowl' }), emitted_at: '2026-10-25T10:00:00.000Z' },
  { body: line('llm', 2, { stage: 'decomposition', model: 'gemini-test', promptVersionId: versionId, response: '{"mealItems":[]}' }), emitted_at: '2026-10-25T10:00:00.400Z' },
  ...['decomposition', 'matching', 'nutrition', 'assembly'].map((stage, i) => ({ body: line('stage', 3 + i, { stage, index: i, status: 'success', input: {}, output: {} }), emitted_at: '2026-10-25T10:00:01.000Z' })),
  { body: line('final', 7, { status: 'success', durationMs: 1000 }), emitted_at: '2026-10-25T10:00:01.500Z' },
];
// A fake binding that records the query and answers with the stored lines.
function fakeD1(results: typeof rows, seen: unknown[][] = []): TraceDb {
  return { prepare: (query) => ({ bind: (...values) => ({ all: async <T,>() => { seen.push([query, ...values]); return { results: results as T[] }; } }) }) };
}

test('D1 lines parse with the Logging reader and label the source', async () => {
  const seen: unknown[][] = [];
  const { entries, incomplete } = await d1Entries(fakeD1(rows, seen), id);
  assert.equal(incomplete, false);
  assert.deepEqual(seen[0].slice(1), [id]);
  const detail = loggingDetail(request, entries, 1, incomplete, 'd1')!;
  assert.equal(detail.source, 'd1');
  assert.equal(detail.stages.length, 4);
  assert.equal(detail.calls[0].createdAt, '2026-10-25T10:00:00.400Z');
  assert.equal(captureIncomplete(detail), false);
  // A prompt version counts as a prompt: the reader shows its template.
  assert.equal(graphDetail(detail).calls[0].hasPrompt, true);
});

test('a node read is scoped to one event and type', async () => {
  const seen: unknown[][] = [];
  await d1Entries(fakeD1(rows.slice(1, 2), seen), id, { key: 'event-2', kind: 'call' });
  assert.deepEqual(seen[0].slice(1), [id, 'event-2', 'llm']);
});

test('a missing final event leaves the D1 capture incomplete, so the reader falls back', async () => {
  const { entries } = await d1Entries(fakeD1(rows.slice(0, -1)), id);
  assert.equal(captureIncomplete(loggingDetail(request, entries, 1, false, 'd1')!), true);
});

test('bodies past the byte bound and unparsable lines report incomplete', async () => {
  const big = { body: line('stage', 9, { output: 'x'.repeat(3_000_001) }), emitted_at: rows[0].emitted_at };
  assert.equal((await d1Entries(fakeD1([rows[0], big]), id)).incomplete, true);
  assert.equal((await d1Entries(fakeD1([{ body: '{', emitted_at: rows[0].emitted_at }]), id)).incomplete, true);
});

test('a D1 call payload shows its prompt template from Postgres', async () => {
  const pg = new PGlite(); const dialect = new PgDialect();
  const db = { async execute(query: SQL) { const q = dialect.sqlToQuery(query); return (await pg.query(q.sql, q.params)).rows; } } as unknown as AppDb;
  try {
    await pg.exec(`CREATE TABLE prompt_versions(id uuid, template_sample text); INSERT INTO prompt_versions VALUES ('${versionId}', 'synthetic template');`);
    const { entries } = await d1Entries(fakeD1(rows), id);
    const detail = loggingDetail(request, entries, 1, false, 'd1')!;
    assert.deepEqual(await nodePayload(db, detail, 'event-2'), { prompt: 'synthetic template', response: '{"mealItems":[]}', promptIsTemplate: true });
    assert.deepEqual(await nodePayload(db, detail, 'event-3'), { input: {}, output: {} });
    await pg.exec(`DELETE FROM prompt_versions`);
    assert.deepEqual(await nodePayload(db, detail, 'event-2'), { prompt: null, response: '{"mealItems":[]}' });
  } finally { await pg.close(); }
});
