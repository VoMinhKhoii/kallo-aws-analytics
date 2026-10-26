# kallo-trace-ingest

A small Cloudflare Worker that stores Kallo's AI meal traces in the
`kallo-traces` D1 database. The admin dashboard (`../dashboard`) reads them from
the same database through its `TRACES` binding. This replaces the Postgres
`pipeline_stage_logs` / `pipeline_llm_calls` payloads, which filled Kallo's free
500 MB Supabase plan.

## What it stores

Kallo already writes every trace event (`request`, `stage`, `llm`, `final`) to
stdout as a `kallo_trace_v1` line for Cloud Logging, redacted and size-capped
(`lib/ai/pipeline/telemetry/cloud-trace/` in Kallo). It posts the same lines here.

| Table | Rows | Kept |
| --- | --- | --- |
| `trace_events` | each line verbatim, keyed by request, event and part | 14 days |
| `ingredient_decisions` | one row per ingredient verdict, derived once a request's matching and assembly stages are both stored: the port of Kallo's `analytics.v_ingredient_decisions` view | 30 days |

Lines carry no user id. A meal averaged 68 KB of trace on prod in October 2026
(p99 136 KB), about 64 KB on disk in D1, so 5 GB holds 14 days of about 5,000
meals a day.

## API

`POST /v1/events` with `Authorization: Bearer <TRACE_INGEST_SECRET>` and

```json
{ "events": [{ "at": "2026-10-25T10:00:00.000Z", "line": "<one kallo_trace_v1 line>" }] }
```

1–64 events, at most 2.5 MB. A malformed line is dropped and the rest are
stored; the answer counts `stored`, `decisions` and `dropped`. Writes are
idempotent. `at` is Kallo's emit time; one more than 15 days old or 5 minutes
ahead is replaced by the receive time. Kallo sends fire-and-forget with a short
timeout and never retries, so this endpoint must stay fast.

A daily cron (03:41 UTC) applies retention.

## Deploy

```bash
npm install
npm run deploy            # applies D1 migrations remotely, then deploys the Worker
npx wrangler secret put TRACE_INGEST_SECRET   # once; paste the value on stdin
```

Use the same secret value for Kallo's `TRACE_INGEST_SECRET` (GCP Secret Manager
`kallo-prod-trace-ingest-secret`) and set Kallo's `TRACE_INGEST_URL` to this
Worker's `/v1/events` URL. At least 32 characters; anything shorter is refused.

At cutover, backfill the last 7 days from Cloud Logging:
`scripts/backfill-from-logging.mjs` (usage in the file).

## Local

```bash
echo "TRACE_INGEST_SECRET=$(openssl rand -hex 24)" > .dev.vars
npm run migrate:local
npm run dev                # http://localhost:8787, local D1 under .wrangler/
npm test && npm run typecheck
```

Copy `.wrangler/state/v3/d1/` into `../dashboard/.wrangler/state/v3/` to let
`next dev` read the same local data.
