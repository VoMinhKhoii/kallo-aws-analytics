import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_EVENTS, parseBatch, parseEvent } from '../src/events';
import { line, REQUEST_ID } from './fixtures';

const now = Date.parse('2026-10-25T10:00:00.000Z');

test('accepts a kallo_trace_v1 line and keeps it verbatim', () => {
  const body = line('e1', 3, 'llm', { model: 'gemini' });
  const e = parseEvent({ at: '2026-10-25T09:59:59.500Z', line: body }, now);
  assert.deepEqual(e, { requestId: REQUEST_ID, eventId: 'e1', part: 1, parts: 1, seq: 3, type: 'llm', emittedAt: '2026-10-25T09:59:59.500Z', body });
});

test('keeps a believable emit time and falls back to the receive time', () => {
  const body = line('e1', 1, 'final', {});
  // A backfill from Cloud Logging keeps the real time, up to 15 days back.
  assert.equal(parseEvent({ at: '2026-10-11T10:00:01Z', line: body }, now)?.emittedAt, '2026-10-11T10:00:01.000Z');
  for (const at of [undefined, 'garbage', '2026-10-10T09:59:59Z', '2026-10-25T10:05:01Z'])
    assert.equal(parseEvent({ at, line: body }, now)?.emittedAt, '2026-10-25T10:00:00.000Z', String(at));
});

test('rejects lines that are not trace envelopes', () => {
  const ok = JSON.parse(line('e1', 1, 'stage', {}));
  for (const bad of [
    { ...ok, kind: 'other' }, { ...ok, requestId: 'nope' }, { ...ok, type: 'secret' }, { ...ok, part: 2 },
    { ...ok, parts: 0 }, { ...ok, seq: -1 }, { ...ok, eventId: '' }, [],
  ]) assert.equal(parseEvent({ line: JSON.stringify(bad) }, now), null, JSON.stringify(bad).slice(0, 60));
  assert.equal(parseEvent({ line: '{' }, now), null);
  assert.equal(parseEvent({ line: 'x'.repeat(200_001) }, now), null);
  assert.equal(parseEvent(null, now), null);
});

test('a batch drops bad lines but keeps the good ones', () => {
  const events = parseBatch({ events: [{ line: line('a', 1, 'request', {}) }, { line: 'junk' }] }, now);
  assert.equal(events?.length, 1);
  assert.equal(parseBatch({ events: [] }, now), null);
  assert.equal(parseBatch({ events: Array(MAX_EVENTS + 1).fill({ line: 'x' }) }, now), null);
  assert.equal(parseBatch(null, now), null);
});
