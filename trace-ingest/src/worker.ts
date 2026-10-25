// kallo-trace-ingest: receives Kallo's AI meal trace events and stores them in
// D1. Kallo posts while a meal is analysed, fire-and-forget, so this Worker
// answers fast, never retries, and drops what it cannot parse.
import { deriveDecisions, type DecisionRow, type StoredPart } from './decisions';
import { MAX_BODY_BYTES, parseBatch, type TraceEvent } from './events';
import { reap } from './retention';

export interface Env {
  TRACES: D1Database;
  TRACE_INGEST_SECRET: string;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || secret.length < 32 || !supplied) return false;
  // Compare digests so the comparison is constant-time and length-blind.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(supplied)),
    crypto.subtle.digest('SHA-256', enc.encode(secret)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function readBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) throw new RangeError('body');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new RangeError('body');
  return JSON.parse(text);
}

const INSERT_EVENT = `INSERT OR IGNORE INTO trace_events
  (request_id, event_id, part, parts, seq, type, emitted_at, received_at, body)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_DECISION = `INSERT OR REPLACE INTO ingredient_decisions
  (request_id, gidx, occurred_at, occurred_on, received_at, ingredient_query, verdict, pool_size, selected_rank, reject_bucket,
   candidate_1_food_id, candidate_1_name, candidate_1_source, candidate_1_similarity,
   candidate_2_food_id, candidate_2_name, candidate_2_source, candidate_2_similarity,
   candidate_3_food_id, candidate_3_name, candidate_3_source, candidate_3_similarity,
   chosen_food_id, chosen_name, chosen_source, chosen_similarity)
  VALUES (${Array(26).fill('?').join(', ')})`;

function decisionValues(d: DecisionRow, now: number): unknown[] {
  const c = [...d.candidates, d.chosen].flatMap((x) => [x.food_id, x.name, x.source, x.similarity]);
  return [d.request_id, d.gidx, d.occurred_at, d.occurred_on, now, d.ingredient_query, d.verdict, d.pool_size, d.selected_rank, d.reject_bucket, ...c];
}

/** Flattens a request's ingredient decisions once matching and assembly are both stored. */
async function deriveFor(db: D1Database, requestId: string, now: number): Promise<number> {
  const { results } = await db
    .prepare(`SELECT event_id, part, parts, type, emitted_at, body FROM trace_events
      WHERE request_id = ? AND type IN ('request', 'stage') ORDER BY seq, part`)
    .bind(requestId)
    .all<StoredPart>();
  const rows = deriveDecisions(requestId, results);
  if (!rows.length) return 0;
  await db.batch(rows.map((d) => db.prepare(INSERT_DECISION).bind(...decisionValues(d, now))));
  return rows.length;
}

export async function ingest(db: D1Database, events: TraceEvent[], now: number): Promise<{ stored: number; decisions: number }> {
  if (events.length) {
    await db.batch(
      events.map((e) =>
        db.prepare(INSERT_EVENT).bind(e.requestId, e.eventId, e.part, e.parts, e.seq, e.type, e.emittedAt, now, e.body),
      ),
    );
  }
  // Only a stage can complete a request's matching + assembly pair.
  const touched = [...new Set(events.filter((e) => e.type === 'stage').map((e) => e.requestId))];
  let decisions = 0;
  for (const id of touched) decisions += await deriveFor(db, id, now);
  return { stored: events.length, decisions };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== '/v1/events') return json({ error: 'Not found.' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (!(await authorized(request, env.TRACE_INGEST_SECRET))) return json({ error: 'Unauthorized.' }, 401);
    let body: unknown;
    try {
      body = await readBody(request);
    } catch (e) {
      return json({ error: e instanceof RangeError ? 'Request too large.' : 'Invalid JSON.' }, e instanceof RangeError ? 413 : 400);
    }
    const now = Date.now();
    const events = parseBatch(body, now);
    if (!events) return json({ error: 'Expected 1-64 events.' }, 400);
    try {
      const result = await ingest(env.TRACES, events, now);
      return json({ ...result, dropped: (body as { events: unknown[] }).events.length - events.length });
    } catch (e) {
      console.error('[trace-ingest] write failed', e instanceof Error ? e.message : String(e));
      return json({ error: 'Write failed.' }, 503);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await reap(env.TRACES, Date.now());
    console.log('[trace-ingest] retention', JSON.stringify(result));
  },
} satisfies ExportedHandler<Env>;
