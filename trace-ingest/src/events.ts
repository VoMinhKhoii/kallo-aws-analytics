// Parses the batch Kallo posts. Each event is one kallo_trace_v1 line, exactly
// as Kallo writes it to stdout for Cloud Logging, plus Kallo's emit time.

export const MAX_EVENTS = 64;
export const MAX_LINE_BYTES = 200_000; // Kallo splits larger events into parts.
export const MAX_BODY_BYTES = 2_500_000;
export const MAX_AGE_MS = 15 * 86_400_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(['request', 'stage', 'llm', 'final']);

export interface TraceEvent {
  requestId: string;
  eventId: string;
  part: number;
  parts: number;
  seq: number;
  type: 'request' | 'stage' | 'llm' | 'final';
  emittedAt: string;
  body: string;
}

const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** One event, or null when it is not a well-formed kallo_trace_v1 line. */
export function parseEvent(raw: unknown, now: number): TraceEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const { at, line } = raw as { at?: unknown; line?: unknown };
  if (typeof line !== 'string' || new TextEncoder().encode(line).length > MAX_LINE_BYTES) return null;
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(line);
  } catch {
    return null;
  }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (e.kind !== 'kallo_trace_v1' || typeof e.requestId !== 'string' || !UUID.test(e.requestId)) return null;
  if (typeof e.eventId !== 'string' || e.eventId.length < 1 || e.eventId.length > 160) return null;
  if (typeof e.type !== 'string' || !TYPES.has(e.type)) return null;
  if (!int(e.seq, 0, 1_000_000) || !int(e.parts, 1, 128) || !int(e.part, 1, e.parts as number)) return null;
  // Kallo's emit time, so a backfill from Cloud Logging keeps real times. Past
  // 15 days back or 5 minutes ahead it is not believable: use ours.
  const sent = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  const emittedAt = new Date(Number.isFinite(sent) && sent >= now - MAX_AGE_MS && sent <= now + 300_000 ? sent : now).toISOString();
  return {
    requestId: e.requestId,
    eventId: e.eventId,
    part: e.part as number,
    parts: e.parts as number,
    seq: e.seq as number,
    type: e.type as TraceEvent['type'],
    emittedAt,
    body: line,
  };
}

export function parseBatch(body: unknown, now: number): TraceEvent[] | null {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > MAX_EVENTS) return null;
  const parsed: TraceEvent[] = [];
  // A bad line is dropped, never the batch: the other events are still good traces.
  for (const raw of events) {
    const event = parseEvent(raw, now);
    if (event) parsed.push(event);
  }
  return parsed;
}
