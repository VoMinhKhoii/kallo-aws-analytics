// One-time backfill at cutover: posts Kallo's kallo_trace_v1 lines already in
// Cloud Logging (kept 7 days) to the ingest Worker, so D1 starts with the same
// history the Postgres trace tables held. Safe to rerun: rows are keyed by
// (request, event, part) and decisions are re-derived idempotently.
//
//   gcloud logging read 'jsonPayload.kind="kallo_trace_v1" AND resource.labels.service_name="kallo-prod"' \
//     --project=cal-487315 --freshness=8d --limit=100000 --format=json > traces.json
//   TRACE_INGEST_SECRET=… node scripts/backfill-from-logging.mjs traces.json https://kallo-trace-ingest.<subdomain>.workers.dev
//
// Read the secret from your shell, never from an argument.
import { readFileSync } from 'node:fs';

const [file, base] = process.argv.slice(2);
const secret = process.env.TRACE_INGEST_SECRET;
if (!file || !base || !secret) {
  console.error('usage: TRACE_INGEST_SECRET=… node scripts/backfill-from-logging.mjs <gcloud-json> <ingest-base-url>');
  process.exit(2);
}
const entries = JSON.parse(readFileSync(file, 'utf8'))
  .filter((e) => e?.jsonPayload?.kind === 'kallo_trace_v1')
  .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
const events = entries.map((e) => ({ at: e.timestamp, line: JSON.stringify(e.jsonPayload) }));
// The Worker takes 64 events and 2.5 MB per request; stay under both, counting JSON escaping.
const batches = [];
for (const event of events) {
  const size = Buffer.byteLength(JSON.stringify(event)) + 1;
  const last = batches.at(-1);
  if (last && last.events.length < 64 && last.bytes + size <= 2_000_000) {
    last.events.push(event);
    last.bytes += size;
  } else batches.push({ events: [event], bytes: size + 16 });
}
const totals = { stored: 0, decisions: 0, dropped: 0 };
for (const [i, batch] of batches.entries()) {
  const response = await fetch(new URL('/v1/events', base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch.events }),
  });
  if (!response.ok) throw new Error(`batch ${i}: HTTP ${response.status} ${await response.text()}`);
  const result = await response.json();
  for (const key of Object.keys(totals)) totals[key] += result[key] ?? 0;
}
console.log(JSON.stringify({ lines: events.length, ...totals }));
