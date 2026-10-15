# Dashboard backend contracts

## Traces

All three trace endpoints require a founder session. Types are client-safe in
`types.ts`; source adapters and queries are server-only dependencies.

- `GET /api/traces?w=24h|7d|30d&q=&status=all|pending|success|error&model=&flags=&cursor=&limit=25`
  returns `TraceList`: `{rows: TraceSummary[], next: string|null, items, nextCursor, retentionDays: 7}`.
  `items`/`nextCursor` are compatibility aliases of `rows`/`next`.
  Instead of `w`, `from=YYYY-MM-DD&to=YYYY-MM-DD` accepts inclusive UTC dates.
  Without dates/window the default is today UTC. `w` takes precedence and uses a
  rolling window; its initial end timestamp is signed into subsequent cursors.
  Limit is 1–50; dates span at most 366 days; literal case-insensitive search is
  limited to 160 characters. `model` matches `pipeline_runs.model_call2` exactly.
  `flags` is a comma-separated AND of `chunked,rescue,fallback,retried,unmatched`.
  SQL applies every filter before the limit and orders by `(created_at,id)`
  descending. HMAC cursors bind all filters and full microsecond positions.
  Replays are excluded; their detail remains accessible by ID. The list is
  limited by the seven-day retention of `pipeline_requests`, even with `w=30d`.
- Each row adds `modelCall1`, `modelCall2` (`string|null`), `items`, `kcalMid`
  (`number|null`), `error` (`string|null`), `ingredients`, `unmatched`, `attempts`,
  `chunkCount`, `rescueCount`, `fallbacks`, `retries` (`number`). Other existing
  `TraceSummary` fields remain. Models/counts come from the latest run by request
  ID, with count fallbacks from stage summaries. Nutrition prefers persisted
  summary values, then assembly bounded midpoint/displayed nutrition.
  `attempts` counts billed rows (`request_count=0`); reservations are excluded.
  `costUsd` is null if any attempt is unpriced, or if no attempts were recorded.
  Chunk/rescue counts prefer recorded stage counts; otherwise explicit attempt
  roles provide counts. Missing historical evidence produces zero counts.
  Retry flags count errored attempts with a later attempt of the same model or
  a fallback from that model, and the same explicit role when present. Without
  roles this is a heuristic: independent parallel work can look like retries.
- `GET /api/traces/:uuid` returns `TraceGraphDetail`, the existing `TraceDetail`
  envelope (`id,source,createdAt,status,errorCode,error,durationMs,rawInput,mealName,
  profile,summary,stages,calls,gaps,completeness`). Stage `input`/`output` are
  replaced by `inputBytes`/`outputBytes`; call `prompt`/`response` are replaced
  by `hasPrompt`/`hasResponse`. Other metadata remains. A synthetic 30-attempt
  graph is tested below 40 KiB; exceptionally large attempt counts, summary
  item lists or error messages may exceed that target. Postgres graph loads
  omit call text and non-assembly stage JSON at the SQL boundary.
- `GET /api/traces/:uuid/payload?node=<stageKey|callId>` returns `TracePayload`:
  `{input,output}` for a stage or `{prompt:string|null,response:string|null,
  promptIsTemplate?:true}` for a call. Exact returned stage keys/call IDs select
  the node; stage keys win a collision. Budget-only calls return null text.
  Missing rendered prompts fall back to `prompt_versions.template_sample`,
  explicitly marked as a template, never an exact provider request. Postgres
  fetches only that node's payload without the graph loader's cumulative cap.

`TraceCall.role` is `call1 | selector | call2_chunk | rescue_call1 |
rescue_selector | rescue_call2 | unknown`. Logging `callRole`/`call_role` wins,
then known stage names. Postgres explicit role/stage IDs win; historical billed
attempt completion timestamps are compared with each stage's
`[created_at-duration_ms,created_at]` window. Decomposition maps to call1,
nutrition to call2_chunk, matching maps to selector only at <=64 output tokens.
Overlapping windows use the first stage in recorded order. Attempts completed
after `request.created_at+duration_ms` have `afterResponse:true`; unmatched
attempts retain unknown roles. Timing cannot reliably identify historical
parallel rescues. New explicit roles remove that ambiguity. Logged calls and
budget attempts are matched once by model, tokens and a five-second time
proximity; unmatched budget rows remain `budget:<uuid>` calls.

Both detail and payload share the same Logging-first loader: verify the
Postgres request exists, then query Logging with a five-second deadline,
20-page / 3 MB budget, project/service/location/kind/request filtering and
multipart validation. Unusable/unavailable captures fall back to Postgres;
usable partial captures retain completeness metadata. Source choice is
re-evaluated each request and may change if Logging availability changes.
Expired summaries return 404; Logging is never used to recover them.
Legacy full loads retain 64 stages, 128 logged calls and 256 budget attempts,
with separate cumulative 768 KiB payload caps. Byte sizes/presence survive
omission; node payload retrieval is independent of those cumulative caps.
SQL has an eight-second statement timeout. Column discovery caches for 15 min.

Trace list success: `Cache-Control: private, max-age=30`, 30 s isolate cache.
Terminal detail/payload (`success,error,completed,failed`): `private, max-age=3600`.
Pending/unknown status and `refresh=1`: `no-store`. Errors are always no-store:
400 invalid filters/IDs/nodes/cursors, 404 missing request/node, 502 source
failure, 401 missing session, 403 reviewer, 503 auth not configured.

## Overview

`GET /api/admin/overview?days=7|30|90` (alias `w=7d|30d|90d`, default 30)
requires any dashboard session. It returns `Overview` from `../admin/overview.ts`
plus `collectedAt`:

- `days`, `through` (today's UTC date).
- `kpis`: `meals,errorRate,p95MealLatencyMs,dau,newSignups,openFeedback`, each an
  `OverviewKpi {value:number|null,comparisonValue:number|null,previousValue:number|null}`.
  `value` includes today for window KPIs; DAU uses yesterday, the latest complete
  UTC day. Change pills must compare `comparisonValue` (N complete days ending
  yesterday) against `previousValue` (the preceding N complete days), never
  `value` against the prior window. DAU comparisons use the final day of each
  complete window. Prior values require >=ceil(0.8*N) observed reservation days
  in both windows (run days for p95). Zero-traffic days conservatively do not
  establish telemetry coverage. Missing coverage suppresses the prior value.
- `mealsDaily:[{date,analysed,errors:number|null}]`, one point per selected day,
  including today; unavailable historical error counts are null.
- `activeUsersDaily:[{date,dau,wau}]` with distinct nonempty `user_hash` from
  `analytics.v_meals`; WAU covers that UTC day and its preceding six days.
- `needsAttention:{failedMealsToday,feedbackOpenOver48h,grantsEndingWithin3Days}`.
  Grants count accounts on active production promo Premium whose last grant
  ends within three days, excluding paying accounts, matching Premium's query.
- `coverage:{currentMealDays,previousMealDays,requiredDays,errorRetentionDays:7,
  p95Source,openFeedbackHistory:false}`.

Meals count primary `/api/analyze-meal` reservation events (`request_count=1`),
which the application writes once per analysis. These include failed attempts
that never emit a pipeline run, unlike `pipeline_runs`; they are the most
complete retained analysis-count source. Both budget events and runs have no
TTL reaper in the checked application schema, covering the 181-day query
horizon needed for 90-day comparisons. Writes are best effort, so coverage
is observed telemetry, not a completeness guarantee. Known replay requests
are excluded from reservations while their debug summary exists.
`pipeline_runs` has `total_ms` but no status; p95 is recorded pipeline duration,
not end-to-end HTTP latency, and may omit runs that fail before persistence.
Errors use the seven-day request store: rate = errors/reserved meals for the
7-day window; 30/90-day rates and all error-rate comparisons are null.
Open feedback is a current snapshot; prior counts cannot be reconstructed
without status history and are null. Signups count retained `auth.users` rows;
deleted accounts are absent. Long-term replay identity cannot be recovered
from budget events after debug summaries expire.

## Metrics and cache

`GET /api/metrics?metrics=<comma-separated allowlist>&from=&to=&refresh=1`
keeps its existing bundle contract and per-metric partial errors. Loads run in
`Promise.all` batches of at most four, with a 60 s isolate cache keyed by metric,
source, role and dates. Overview also caches 60 s, scoped by database, role,
days and UTC date. Both return `private, max-age=30, stale-while-revalidate=300`;
refresh returns no-store. Refresh bypasses a completed cache entry immediately;
concurrent identical in-flight loads still coalesce. Failed loads do not cache.
Caches are bounded and isolate-local; no shared cache or invalidation is implied.

## Local login

`DASHBOARD_EXTRA_ORIGINS` is a non-secret comma-separated exact origin allowlist
(e.g. `http://127.0.0.1:43123`); only HTTP(S) origins without path/query/credentials
are accepted. Default deployed origins remain trusted; non-production also
trusts the request's loopback origin. Forwarded headers never establish trust.
`DASHBOARD_COOKIE_SECURE=false` disables Secure only when the actual request URL
host is `localhost` or `127.0.0.1`, including production `next start`. All other
hosts retain Secure. Login and logout both evaluate cookie flags per request.
Credentials/session HMAC/eight-hour expiry, strict SameSite and HttpOnly remain.
Login keeps its 8 KiB body bound and optional Cloudflare per-IP/global limits.

Google Logging uses `GOOGLE_MONITORING_CREDENTIALS` with logging.read scope,
`GCP_PROJECT_ID` and optional `GCP_CLOUD_RUN_SERVICE`/`GCP_CLOUD_RUN_LOCATION`.
Production query plans, row volumes, capture coverage and IAM need deployment
verification; all backend tests use synthetic fixtures and fake transports.
