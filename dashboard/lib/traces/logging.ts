import { stageStats } from './stats';
import { z } from 'zod';
import { googleAccessToken } from '../admin/cloud-monitoring';
import { assembleDetail, normalizeCall, type Row } from './normalize';
import type { TraceDetail, TraceStage, TracePayload } from './types';
const envelope = z.object({ kind: z.literal('kallo_trace_v1'), requestId: z.string().uuid(), eventId: z.string().min(1).max(160),
  seq: z.number().int().nonnegative(), type: z.enum(['request','stage','llm','final']), part: z.number().int().min(1).max(128), parts: z.number().int().min(1).max(128), truncated: z.boolean().optional() }).passthrough();
export function reassemble(entries: unknown[], requestId: string): { events: Row[]; truncated: boolean } {
  const groups = new Map<string, { header: z.infer<typeof envelope>; chunks: Map<number, Row> }>();
  let bytes = 0, truncated = false;
  for (const raw of entries) {
    const entry = raw as {jsonPayload?:unknown; timestamp?:unknown} | null;
    const payload = entry?.jsonPayload ?? raw;
    const serialized = JSON.stringify(raw);
    if (serialized === undefined) { truncated = true; continue; }
    bytes += Buffer.byteLength(serialized);
    if (bytes > 2500000) { truncated = true; break; }
    const parsed = envelope.safeParse(payload);
    if (!parsed.success || parsed.data.requestId !== requestId) { truncated = true; continue; }
    const e = parsed.data;
    if (typeof entry?.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp))) e.entryTimestamp = entry.timestamp;
    truncated ||= Boolean(e.truncated);
    let group = groups.get(e.eventId);
    if (!group) { group = { header: e, chunks: new Map() }; groups.set(e.eventId, group); }
    if (e.parts !== group.header.parts || e.seq !== group.header.seq || e.type !== group.header.type || e.part > e.parts) { truncated = true; continue; }
    group.chunks.set(e.part, e);
  }
  const events: Row[] = [];
  for (const { header, chunks } of groups.values()) {
    if (chunks.size !== header.parts) { truncated = true; continue; }
    try {
      const sorted = [...chunks].sort(([a],[b]) => a-b).map(([,v]) => v);
      const chunked = header.parts > 1 || typeof sorted[0].payload === 'string';
      if (chunked && sorted.some(e => typeof e.payload !== 'string')) { truncated = true; continue; }
      const payload = chunked ? JSON.parse(sorted.map(e => e.payload).join('')) : sorted[0];
      events.push({ ...payload, eventId: header.eventId, seq: header.seq, type: header.type, entryTimestamp: sorted[0].entryTimestamp ?? header.entryTimestamp });
    } catch { truncated = true; }
  }
  return { events: events.sort((a,b) => a.seq-b.seq), truncated };
}
export function loggingDetail(request: Row, entries: unknown[], billed: number, incomplete = false): TraceDetail | null {
  const { events, truncated } = reassemble(entries, request.id);
  // A lone marker or orphaned model call is not a usable Logging capture.
  if (!events.some(e => e.type === 'request' || e.type === 'stage' || e.type === 'final')) return null;
  const req = events.find(e => e.type === 'request') || {};
  const final = events.findLast(e => e.type === 'final') || {};
  const stages: TraceStage[] = events.filter(e => e.type === 'stage').map(e => ({
    key: String(e.eventId), name: String(e.stage || 'unknown'), index: Number(e.index || 0), startedAt: e.startedAt || request.created_at,
    stats: stageStats(e.input, e.output, e.output?.result), durationMs: e.durationMs ?? null, status: e.status || 'unknown', error: e.error ?? null, input: e.input ?? null, output: e.output ?? null, calls: [],
  }));
  const calls = events.filter(e => e.type === 'llm').map(e => normalizeCall({ ...e, id: e.eventId, createdAt:e.entryTimestamp }));
  const result = final.summary || final.result || events.findLast(e => e.type === 'stage' && e.stage === 'assembly')?.output?.result || {};
  return assembleDetail({ ...request, ...req, ...final, id: request.id }, stages, calls, result, 'logging', billed,
    truncated || incomplete || !events.some(e => e.type === 'request') || !events.some(e => e.type === 'final'));
}
async function loadLoggingCapture(request: Row, node?: {key: string; kind: 'stage' | 'call'}): Promise<{entries: unknown[]; incomplete: boolean} | null> {
  if (!process.env.GOOGLE_MONITORING_CREDENTIALS) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const read = async () => {
    const token = await googleAccessToken('https://www.googleapis.com/auth/logging.read', controller.signal);
    const project = process.env.GCP_PROJECT_ID || 'cal-487315';
    const start = Date.parse(request.created_at);
    const end = Math.min(start + Math.max(Number(request.duration_ms || 0), 60000) + 300000, start + 86400000);
    let filter = `resource.type="cloud_run_revision" AND resource.labels.service_name=${JSON.stringify(process.env.GCP_CLOUD_RUN_SERVICE || 'kallo-prod')} AND resource.labels.location=${JSON.stringify(process.env.GCP_CLOUD_RUN_LOCATION || 'asia-southeast1')} AND jsonPayload.kind="kallo_trace_v1" AND jsonPayload.requestId=${JSON.stringify(request.id)} AND timestamp>="${new Date(start-60000).toISOString()}" AND timestamp<="${new Date(end).toISOString()}"`;
    if (node) filter += ` AND jsonPayload.type=${JSON.stringify(node.kind === 'call' ? 'llm' : 'stage')} AND jsonPayload.eventId=${JSON.stringify(node.key)}`;
    let pageToken: string | undefined, bytes = 0;
    const entries: unknown[] = [], seenTokens = new Set<string>();
    for (let page=0; page<20; page++) {
      const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
        method: 'POST', signal: controller.signal, cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceNames: ['projects/' + project], filter, orderBy: 'timestamp asc', pageSize: 100, ...(pageToken ? { pageToken } : {}) }),
      });
      if (!response.ok) return null;
      // Bound the response before parsing, including malformed upstream responses.
      const reader = response.body?.getReader();
      if (!reader) return null;
      let text = ''; const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 3000000) { void reader.cancel().catch(() => {}); return {entries, incomplete:true}; }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const body = JSON.parse(text) as { entries?: { jsonPayload?: unknown; timestamp?: string }[]; nextPageToken?: string };
      entries.push(...(body.entries || []));
      pageToken = body.nextPageToken;
      if (!pageToken) return {entries, incomplete:false};
      if (seenTokens.has(pageToken)) break;
      seenTokens.add(pageToken);
    }
    return {entries, incomplete:true};
  };
  try {
    // Race also bounds adapters whose fetch does not honor AbortSignal.
    return await Promise.race([read(), new Promise<null>(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }))]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function loadLoggingDetail(request: Row, billed: number): Promise<TraceDetail | null> {
  const capture = await loadLoggingCapture(request);
  return capture ? loggingDetail(request, capture.entries, billed, capture.incomplete) : null;
}
export async function loadLoggingPayload(request: Row, key: string, kind: 'stage' | 'call'): Promise<TracePayload | null> {
  const capture = await loadLoggingCapture(request, {key, kind});
  if (!capture || capture.incomplete) return null;
  const {events, truncated} = reassemble(capture.entries, request.id);
  if (truncated) return null;
  const event = events.find(e => kind === 'call' ? e.type === 'llm' && e.eventId === key : e.type === 'stage' && (e.stage === key || e.eventId === key));
  if (!event) return null;
  return kind === 'stage' ? {input:event.input ?? null, output:event.output ?? null}
    : {prompt:event.prompt ?? null, response:event.response ?? null, ...(event.promptIsTemplate ? {promptIsTemplate:true} : {})};
}
