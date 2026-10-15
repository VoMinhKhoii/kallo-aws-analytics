# Dashboard trace API

Both handlers require a founder session and return `Cache-Control: no-store`.
The shared client-safe contracts are in `types.ts`: `TraceSummary`, `TraceList`,
`TraceDetail`, `TraceStage`, `TraceCall`, `TraceItem`, `Nutrient`, and `CallId`.
No trace detail is retained in a Worker cache.

- `GET /api/traces?from=YYYY-MM-DD&to=YYYY-MM-DD&status=all|pending|success|error&q=&cursor=&limit=25`
  returns `TraceList`: `{ items: TraceSummary[], nextCursor: string | null, retentionDays: 7 }`.
  Dates are required, inclusive UTC calendar dates (SQL uses a half-open interval
  ending at midnight after `to`). Windows are limited to 366 days, search to 160
  characters, and limit to 1–50. Search is literal case-insensitive substring
  matching, preserving diacritics. HMAC cursors bind the date/status/search
  filters and exact Postgres `(created_at, id)` position; limit may change.
- `GET /api/traces/:uuid` returns `TraceDetail` directly. It first verifies that
  the Postgres summary exists, then reads Logging with a five-second deadline,
  bounded timestamps, 20 pages, and a 3 MB response budget. Logging is filtered
  by project, Cloud Run service/location, kind, and request UUID. Multipart
  events use one-based `part`/`parts` and JSON string fragments in `payload`.
  Unavailable/forbidden/quota-limited Logging, malformed responses, a timeout,
  or an absent usable capture falls back to Postgres. A usable partial capture
  is returned with explicit completeness and truncation metadata.

Invalid filters/IDs/cursors return 400, unknown summaries 404, unavailable
Postgres 502, missing authentication 401, reviewer access 403, and unconfigured
authentication 503. Deleted/expired summary rows cannot be distinguished from
unknown IDs, so both return 404. Never recover a trace from Logging after its
summary has been deleted.

Summary-column discovery is cached for 15 minutes, so the API works before
and after the expand migration; a warm isolate may use legacy derivation for
up to 15 minutes after columns are added. Legacy nutrition derives from the
assembly result; missing names use a raw-input preview. Budget attempts
(`request_count=0`, excluding reservation rows) supply calls/cost/models in the
same list query. Budget events are grouped against the bounded page, rather
than scanned separately for each request. Unknown costs remain nullable.

Legacy detail reads use `prompt_versions.template_sample` when a rendered
prompt is null. This is a template fallback, not a claim that it is the exact
provider request. Unmatched budget attempts appear as `budget:<id>` calls,
with unknown stage/prompt/response; matching uses model, tokens, and a five
second timestamp tolerance because legacy budget rows have no LLM-call ID.
`callsLogged` counts legacy payload call rows and `callsBilled` counts attempt
rows. Each legacy payload stream has a 768 KiB budget, with at most 64 stages,
128 payload calls, and 256 billed attempts; omitted payloads and reached row
caps set `completeness.truncated`. Trace SQL statements time out after eight
seconds. Production query plans/latency still need verification against the
real database; no production requests are made by the tests.

Logging uses `GOOGLE_MONITORING_CREDENTIALS` with a separately cached
`https://www.googleapis.com/auth/logging.read` token. Configure `GCP_PROJECT_ID`
and optionally `GCP_CLOUD_RUN_SERVICE` / `GCP_CLOUD_RUN_LOCATION`; defaults
match the existing Monitoring integration. Provisioning the seven-day Logging
bucket, sink, exclusion, and reader IAM is outside this dashboard change.

Aggregate metrics use the shared bounded isolate cache in `../admin/cache.ts`,
keyed by metric, source, dates, role, and schema version. TTL is 60 seconds for
windows containing today (UTC), 15 minutes otherwise; Monitoring keeps its
five-minute TTL. Concurrent identical misses share a load; `refresh=1` bypass
is limited to once per ten seconds for a resident key. Metrics return
`collectedAt` (oldest included collection) and `collectedAtByMetric`.
Eviction and separate Worker isolates reset this local throttle/cache.

Login accepts an 8 KiB stream and a strict Zod credentials object. Founder
values retain their original bytes. Missing/invalid optional reviewer pairs
are disabled independently. Production cookies always require HTTPS; HMAC
session format and eight-hour expiry are unchanged. Allowed origins are
`https://admin.kallo.fit`, `https://kallo-admin.minhkhoitdn.workers.dev`, and the
request's loopback origin outside production. Forwarded hosts are not trusted.
Login bindings enforce 5/min per `CF-Connecting-IP` and 30/min aggregate;
429 uses the generic credentials body and `Retry-After: 60`. Absent or failed
bindings fail open, while a known denial by either available limiter wins.
Cloudflare's rate limits are approximate and local to a location, not global.
Legacy analytics `requestsPage` / `traceDetail` are also founder-only and
uncached to prevent a parallel access path for reviewers.

Implementation references: [Cloudflare rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
and [Google entries.list](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list).
