# Kallo admin on Cloudflare

Production: https://admin.kallo.fit

Fallback host: https://kallo-admin.minhkhoitdn.workers.dev

The permanent operator console runs as the `kallo-admin` Cloudflare Worker,
using Next.js 15 and OpenNext. Static assets use Workers Assets. Authentication
uses the existing founder/reviewer credentials and signed eight-hour cookies.
Credentials are Worker secrets and never included in the browser bundle.

## Features and sources

- `/`: production account counts, request trends, and open feedback.
- `/premium`: welcome-offer settings, account search/details, selected/group/everyone
  grants, end free access, preview counts, and audited undo.
- `/requests`: paginated original requests, stage timings, and model-call metadata.
- `/feedback`: paginated feedback and status triage.
- `/analytics`, `/ingredients`: the existing analytics contract, aggregated
  directly in Postgres from privacy-reduced `analytics.v_*` views. No Academy lab
  session is required. Token estimates use the documented 9 September 2026 pricing
  snapshot from `glue/transforms.py`; unknown models remain unpriced.
- `/ai`: AI spend, calls, tokens, cost per 1k meals, p95/p99 latency, error,
  fallback and cache-hit rates per model over 7, 30 or 90 UTC days, each KPI
  compared with the window before it (only when the data covers at least 80% of
  that earlier window). It reads four metrics (`ai_usage_daily`,
  `ai_model_window`, `ai_meals_daily`, `ai_meal_window`) from
  `analytics.v_budget_events`. Cost is the `cost_usd` Kallo records on every model
  call, priced from the provider's token counts; models Kallo cannot price stay
  unpriced and are counted. Percentiles are computed over raw calls per window,
  never averaged from daily values.
- `/system`: Google Monitoring queried directly using the existing read-only reader.
  Direct mode shows HTTP percentiles across all traffic. The optional AWS collector's
  AI/non-AI HTTP split is available only in AWS mode; direct mode does not invent it.
- `/trace`: bounded server-side Supabase RPCs with the existing sanitization boundary.

Premium domain logic was ported from Kallo PR #415, commit
`d1a73a950bbb62c2d8596022e2b7b3c3cf3200cd`. Modules under
`dashboard/lib/admin/premium/` preserve its transactions, paying-account exclusion,
production/sandbox grants, audit attribution, and one-time undo. The database must
have Kallo's Premium migrations from PRs #414–415. Kallo's own deployment applies
these migrations; this repository does not push them.

Kallo also owns `analytics.v_budget_events`. The `/ai` page needs its
`cost_usd`, `latency_ms`, `fallback_from` and `cache_write_tokens` columns from
Kallo PR #460; deploy the dashboard only after those migrations are on production.

Account-level records and Premium reads/writes require founder access. Mutations
require same-origin requests. Reviewers can read aggregate analytics, monitoring,
and the existing bounded trace contract.

## Deploy

From `dashboard/`:

```sh
npm ci
npx wrangler whoami
npm run typecheck
npm run test:admin
npm run test:metrics
npm run test:ai-usage
npm run deploy
```

`npm run deploy` builds Next.js, generates OpenNext, and deploys the Worker.
`npm run preview` builds and serves the Worker locally. `npm run cf-typegen`
regenerates binding declarations without conflicting Workers DOM types.

The compatibility date uses Cloudflare's UTC date, which can be a day behind the
local timezone. `wrangler.jsonc` contains a Custom Domain and an exact
`admin.kallo.fit/*` route. The exact route overrides Kallo's wildcard proxy.
Keep both entries. The root app's routes are unaffected. Version preview URLs
are disabled; workers.dev enforces the same login.

## AI trace store (D1)

Kallo's AI meal traces live in the `kallo-traces` D1 database (APAC), bound to
this Worker as `TRACES` in `wrangler.jsonc`. The `kallo-trace-ingest` Worker
(`../trace-ingest/README.md`) fills it. Trace detail reads D1 first, then Cloud
Logging, then the old Postgres tables. The Ingredients metrics (`ingredient_*`,
`corpus_reverse_lookup`) read D1's `ingredient_decisions`
(`lib/admin/decision-metrics.ts`) and fall back to the Postgres view only when
the binding is missing. `next dev` gets local bindings from
`initOpenNextCloudflareForDev` in `next.config.ts`.

Deploy order at cutover: the ingest Worker and its secret, then the backfill
from Cloud Logging, then Kallo with `TRACE_INGEST_URL` / `TRACE_INGEST_SECRET`,
then this dashboard.

## Secrets

Set these through Cloudflare secrets using interactive stdin or an ignored,
protected file. Never put values into command arguments or commits.

- `DASHBOARD_FOUNDER_USERNAME`, `DASHBOARD_FOUNDER_PASSWORD`
- `DASHBOARD_REVIEWER_USERNAME`, `DASHBOARD_REVIEWER_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `DATABASE_URL` (production Supabase pooler; URL-encode its password)
- `ADMIN_EMAILS` or `DASHBOARD_ADMIN_EMAIL` (real audit identity)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_MONITORING_CREDENTIALS` (existing read-only service-account JSON)
- `GCP_PROJECT_ID`, `GCP_CLOUD_RUN_SERVICE`, `GCP_CLOUD_RUN_LOCATION`

`METRICS_SOURCE=postgres` is a nonsecret Wrangler variable. Optional AWS mode needs
`API_BASE_URL`, `DASHBOARD_TOKEN`, and an active AWS data stack. Local secrets belong
in ignored `.env.local` / `.dev.vars` files. Keep the JSON key outside the repository.
`scripts/verify-live.mts` reads all metric contracts and Monitoring without writes.
`node --import tsx scripts/verify-deployment.mts` verifies the deployed custom
domain, TLS, login roles, live APIs, and mutation protections without changing
business records. It uses public DNS to avoid a cached predeployment DNS failure.

## Validation

- Production build, packaging, and deployment.
- Founder login, overview, Premium, account search/details, request/feedback lists,
  request inspection, and grant previews.
- Anonymous/reviewer denial for founder APIs and cross-origin mutation denial.
- Eleven Premium safety and isolated PostgreSQL integration checks for grant,
  end, undo, targeting, paying-account protection, offer settings, and rollback.
- Three metric checks cover all thirteen SQL metrics with controlled data,
  distribution-preserving Monitoring aggregation, and coherent daily mappings.
- Live reads of thirteen analytics metrics and Google Monitoring.

Validation does not grant/end Premium, change signup settings, or triage real
feedback. Writes preserve the upstream transaction implementation.
Historical requests with no stored stage/model-call records show explicit empty
states; the dashboard does not synthesize missing telemetry. Ingredients rankings
retain bounded groups, and the UI labels those subsets and summed daily queries.

## Cloudflare agent setup

Official Cloudflare skills were installed under `~/.agents/skills/` and Codex's
global skills directory. Five MCP servers were registered in
`~/.codex/config.toml`: `cloudflare`, `cloudflare-docs`, `cloudflare-bindings`,
`cloudflare-builds`, and `cloudflare-observability`. Restart Codex to load them
in a new session. Four use OAuth; the documentation server is public. Wrangler
is already authenticated.
