import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { parseBatch } from '../src/events';
import { ingest, readBody } from '../src/worker';
import { assembly, line, matching, REQUEST_ID } from './fixtures';

// node:sqlite behind the slice of the D1 API the Worker uses.
function sqliteD1() {
  const lite = new DatabaseSync(':memory:');
  lite.exec(readFileSync(new URL('../migrations/0001_trace_store.sql', import.meta.url), 'utf8'));
  const prepare = (query: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...v: unknown[]) => ((values = v), statement),
      all: async () => ({ results: lite.prepare(query).all(...(values as never[])) }),
      run: async () => ({ meta: { changes: Number(lite.prepare(query).run(...(values as never[])).changes) } }),
    };
    return statement;
  };
  const db = { prepare, batch: async (statements: { run(): Promise<unknown> }[]) => { for (const s of statements) await s.run(); } };
  return { db: db as unknown as D1Database, lite };
}

const streamed = (chunks: string[]) =>
  new Request('https://ingest.test/v1/events', {
    method: 'POST',
    body: new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close(); } }),
    // @ts-expect-error Node needs duplex for a streamed body.
    duplex: 'half',
  });

test('the body limit holds for a chunked upload with no content-length', async () => {
  await assert.rejects(readBody(streamed(Array(30).fill('x'.repeat(100_000)))), RangeError);
  assert.deepEqual(await readBody(streamed(['{"events":', '[]}'])), { events: [] });
  const declared = new Request('https://ingest.test/v1/events', { method: 'POST', body: '{}', headers: { 'content-length': '2500001' } });
  await assert.rejects(readBody(declared), RangeError);
});

test('a late request event corrects decision times, and a re-post changes nothing', async () => {
  const { db, lite } = sqliteD1();
  const now = Date.parse('2026-10-25T10:00:10.000Z');
  const batch = (events: { at: string; line: string }[]) => parseBatch({ events }, now)!;
  await ingest(db, batch([
    { at: '2026-10-25T10:00:05.000Z', line: line('s1', 2, 'stage', matching) },
    { at: '2026-10-25T10:00:06.000Z', line: line('s3', 4, 'stage', assembly) },
  ]), now);
  const times = () => lite.prepare('SELECT DISTINCT occurred_at FROM ingredient_decisions').all().map((r) => r.occurred_at);
  assert.deepEqual(times(), ['2026-10-25T10:00:06.000Z']);
  const late = batch([{ at: '2026-10-25T10:00:00.000Z', line: line('r1', 1, 'request', { rawInput: 'x' }) }]);
  await ingest(db, late, now);
  assert.deepEqual(times(), ['2026-10-25T10:00:00.000Z']);
  await ingest(db, late, now);
  assert.equal(lite.prepare('SELECT count(*) AS n FROM trace_events').get()?.n, 3);
  assert.equal(lite.prepare('SELECT count(*) AS n FROM ingredient_decisions').get()?.n, 3);
  assert.equal(REQUEST_ID, lite.prepare('SELECT DISTINCT request_id FROM trace_events').get()?.request_id);
});
