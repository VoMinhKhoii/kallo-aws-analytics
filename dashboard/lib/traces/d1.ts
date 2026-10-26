import 'server-only';
import { loggingDetail, reassemble, type CapturedPayload } from './logging';
import type { Row } from './normalize';
import type { TraceDetail } from './types';

// The kallo-traces D1 database that the kallo-trace-ingest Worker fills
// (trace-ingest/). It holds Kallo's kallo_trace_v1 lines verbatim, so the Cloud
// Logging parser reads them unchanged.
// The slice of the D1 binding used here (the dashboard has no Workers runtime types).
export interface TraceDb { prepare(query: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } } }
export async function traceStore(): Promise<TraceDb | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (getCloudflareContext().env as { TRACES?: TraceDb }).TRACES ?? null;
  } catch { return null; }
}

// Kallo caps one request's trace at 2 MB; anything past this bound is not ours.
const MAX_BYTES = 3_000_000;
interface Stored { body: string; emitted_at: string }
/** The request's lines as Logging-style entries; incomplete when bounded. */
export async function d1Entries(db: TraceDb, id: string, node?: { key: string; kind: 'stage' | 'call' }): Promise<{ entries: unknown[]; incomplete: boolean }> {
  const statement = node
    ? db.prepare(`SELECT body, emitted_at FROM trace_events WHERE request_id = ? AND event_id = ? AND type = ? ORDER BY seq, part LIMIT 256`).bind(id, node.key, node.kind === 'call' ? 'llm' : 'stage')
    : db.prepare(`SELECT body, emitted_at FROM trace_events WHERE request_id = ? ORDER BY seq, part LIMIT 2048`).bind(id);
  const { results } = await statement.all<Stored>();
  const entries: unknown[] = []; let bytes = 0;
  for (const row of results) {
    bytes += row.body.length;
    if (bytes > MAX_BYTES) return { entries, incomplete: true };
    try { entries.push({ jsonPayload: JSON.parse(row.body), timestamp: row.emitted_at }); } catch { return { entries, incomplete: true }; }
  }
  return { entries, incomplete: false };
}

export async function loadD1Detail(request: Row, billed: number): Promise<TraceDetail | null> {
  const db = await traceStore();
  if (!db) return null;
  try {
    const { entries, incomplete } = await d1Entries(db, request.id);
    return entries.length ? loggingDetail(request, entries, billed, incomplete, 'd1') : null;
  } catch (e) {
    console.error('[traces] D1 read failed', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function loadD1Payload(request: Row, key: string, kind: 'stage' | 'call'): Promise<CapturedPayload | null> {
  const db = await traceStore();
  if (!db) return null;
  try {
    const { entries, incomplete } = await d1Entries(db, request.id, { key, kind });
    if (incomplete) return null;
    const { events, truncated } = reassemble(entries, request.id);
    const event = events.find(e => e.eventId === key);
    if (truncated || !event) return null;
    return kind === 'stage' ? { input: event.input ?? null, output: event.output ?? null } : { prompt: event.prompt ?? null, response: event.response ?? null, promptVersionId: event.promptVersionId ?? null };
  } catch { return null; }
}
