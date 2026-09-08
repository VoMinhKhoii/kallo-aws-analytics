# Archived handoff — superseded by the Cloud Monitoring architecture

> Historical only. Athena and the generated Gemini summary were removed on 2026-09-08. Use `docs/solution-architecture.md` and `scripts/README.md` for the current contract.

# Codex handoff — Kallo Analytics Plane, local end-to-end verification

You are picking up a partially-finished body of work in `~/Documents/kallo-aws-analytics`.
Read this whole file before touching anything. Everything below was verified against the
code on 2026-08-23; do not trust it blindly, but do not re-derive it either.

---

## 1. What this project is

An analytics/ops plane on AWS for **kallo.fit**, a live Vietnamese calorie-tracking app
(production runs on GCP Cloud Run + Supabase Postgres — *not* on AWS). The AWS side is
built for **RMIT Cloud Computing Assessment 3**: 40% of the grade, due 2026-09-12, with a
live 30-minute demo and Q&A in week 12. The author must be able to defend every line.

Pipeline shape (locked; do not redesign):

```
EventBridge (daily) → Lambda extract → Supabase REST (analytics schema, restricted JWT)
                            │ writes JSONL
                            ▼
                  S3 raw/ + manifest.json
                            │ exactly one StartJobRun
                            ▼
                  Glue PySpark (S3→S3): raw JSON → curated Parquet + aggregates/
                            │ EventBridge Glue state-change rule
                            ▼
                  Lambda loader → DynamoDB (PK=metric, SK=date)

Dashboard (Next.js on ECS Fargate behind ALB) → API Gateway → Lambda → DynamoDB / Athena / Gemini
```

### Hard environment constraints — violating any of these is a failure

- **AWS Academy Learner Lab. $50 total budget. Exceeding it DELETES the account.**
- Region **us-east-1 only**.
- **No IAM resources may appear in CloudFormation.** No `AWS::IAM::Role`, no
  `AWS::IAM::Policy`. Reference the pre-made role by ARN:
  `arn:aws:iam::${AWS::AccountId}:role/LabRole`. ECS uses LabRole as *both* task role and
  execution role.
- CloudFront, Cognito, Amplify are unavailable.
- Glue: `NumberOfWorkers: 2`, `WorkerType: G.1X`, `MaxRetries: 0`, `Timeout: 10`,
  `MaxConcurrentRuns: 1`. Athena: workgroup with an enforced bytes-scanned cutoff.
  Lambda: reserved concurrency ≤ 2 per function.
- No VPC creation, no NAT gateways, no VPC endpoints, no Lambda VPC config, ever.

### Non-negotiable conduct rules

- **Never present mock or locally-computed data as live AWS output.** The demo fallback is
  a labelled recording plus screenshots of the real deployment — never fabricated data.
- **Never handle the Supabase project JWT *signing secret*.** It can mint a token for any
  role including `service_role`. Khoi mints tokens himself; you only ever receive an
  already-minted, restricted `analytics_reader` token via an environment variable. Do not
  echo it, log it, screenshot it, or write it to a file.
- The sanitized views deliberately exclude raw user meal text (`rawInput`), free-text
  reject reasons, ingredient/meal/matched names from JSON facts, emails, `ip_hash`, user
  and session ids, prompts, and model-response text. `waitlist_signups` stays out entirely.
  Do not widen the allowlist.
- Do not commit secrets or `.lab-config`.

---

## 2. Repository state right now

`HEAD` is `8b2b68f`. **The working tree is dirty and nothing below is committed.**
22 modified files, 2 untracked paths, +863/−294. Verified green as of handoff:

```
python3 -m pytest -q            # 54 passed
ruff check .                    # All checks passed
cd dashboard && ./node_modules/.bin/tsc --noEmit   # clean
cfn-lint (via `from cfnlint import api; api.lint_all(...)`)  # 0 errors/warnings on all
                                                             # three templates; only
                                                             # pre-existing I-level notes
```

`dashboard/node_modules` was installed this session (93 packages). `dashboard/tsconfig.tsbuildinfo`
is modified as a build artifact — ignore it.

### 2.1 What was changed and why

**Full-snapshot extraction (done earlier, already in the tree).**
Incremental watermarking was removed entirely. Every run pulls each view completely. The
reasons are recorded in `PROJECT_SPEC.md:63-65`: a `gt.<watermark>` cursor silently drops
every row sharing the watermark's value (fatal on coarsened timestamps); watermarks
committed per-view before the run finished, so a later failure stranded earlier rows; and
a second same-day run produced an empty delta whose aggregates overwrote the good ones,
blanking the dashboard while reporting success.

**Blocker 4 — run-scoped S3 artifacts.** Two runs on one day previously shared object keys.
Now every artifact carries `run=<run_id>`:
- `lambdas/extract/extract_core.py` — raw parts are
  `raw/<view>/dt=<date>/run=<run_id>/part-N.jsonl`; the manifest is
  `raw/_manifests/dt=<date>/run=<run_id>/manifest.json`. `extract_view` takes a new
  required `run_id` keyword.
- `glue/job.py` — aggregates are `aggregates/dt=<date>/run=<run_id>/<metric>.json`.
- `lambdas/loader/loader_core.py` — `AGGREGATE_KEY` regex gained the run segment;
  `read_aggregate_payloads` now takes `run_id` and lists only that run's prefix, so a
  stale metric from an earlier run on the same day can no longer be loaded.
- `latest_manifest_key` used to sort by `(date, key)`. Run ids are random UUIDs, so that
  ordering was meaningless for two runs on one day. It now sorts on S3 `LastModified`,
  falling back to the key when a listing omits it.

**A bug found while reading `glue/job.py` (not previously on any list).**
Full snapshots written into a `dt=<extraction_date>` partition mean Athena reads the same
source row once per snapshot that ever ran, silently multiplying every count. `curated/` is
now overwritten unpartitioned on each run (`glue/job.py`), and the three Glue catalog
tables in `infra/data-stack.yaml` had their `dt` partition key and partition-projection
parameters removed to match. **This is the change most likely to be wrong — verify it.**
Known residual: if a view legitimately returns zero rows, the Glue job `continue`s and
leaves that view's previous `curated/` output in place. No current view is ever empty, so
this was left alone rather than speculatively handled. Flag it if it becomes reachable.

**Blocker 10 — run-now failure states.** Previously a started run could poll forever and a
single network blip was terminal.
- `lambdas/api/runs.py` — `POST /runs` now writes a `queued` status item **before** the
  asynchronous invoke, closing the race where the dashboard's first poll beat the extract
  Lambda and got a hard 404. A rejected invoke marks the run `failed` instead of leaving
  it stuck at `queued`.
- `lambdas/api/api_core.py` — `get_run_record` uses `ConsistentRead=True`; an eventually
  consistent miss was indistinguishable from an unknown run.
- `lambdas/extract/handler.py` — on any exception, an on-demand run is marked `failed`
  with the exception class name, then the exception is re-raised so CloudWatch and the
  Lambda error metric still see it.
- `lambdas/loader/` — new `FAILED_GLUE_STATES = {FAILED, TIMEOUT, STOPPED}`,
  `glue_event_state`, `event_run_id`, `mark_run_failed`. The handler records a terminal
  failure for those events, and also marks the run failed when Glue succeeded but the
  aggregates turn out unloadable.
- `infra/data-stack.yaml` — new `GlueFailedRule` + `GlueFailedInvokePermission` targeting
  the loader for those three states.
- `dashboard/app/components/action-center.tsx` — `completed` and `failed` are terminal;
  up to 3 consecutive poll errors are tolerated with a visible retry notice before giving
  up; a 12-minute ceiling ends the poll with an actionable message. `RunStatus` gained
  `failure_reason`.

**`match_rate` denominator.** `glue/transforms.py` divided by `matched + unmatched`. In the
2026-08-22 production snapshot that is 918/1021 = 89.9%, but the runs' own
`ingredient_count` was 1039 — 18 ingredients were in neither bucket and vanished from the
ratio. The denominator is now `ingredient_count`, and the gap is published as
`unaccounted_count` rather than hidden. `dashboard/app/lib/types.ts`,
`dashboard/mocks/match_rate.json`, the panel subtitle, and the golden test moved with it,
plus a new focused test using the real production figures.

**Blocker 5 — probe stack.** `infra/probe-stack.yaml` previously had no ECS, ECR, ALB or
Fargate at all, leaving 9 of the 25 service marks resting on untested assumptions. It now
has an `AWS::ECR::Repository` and a conditional ALB + Fargate tier gated on a
`ProbeImageUri` parameter (empty on the first pass, since a service cannot be created
before its image exists). New: `infra/probe-image/Dockerfile` (busybox httpd on port 3000)
and `scripts/session-zero-probe.sh`, which drives both passes, pushes the image with the
operator's federated session credentials, and polls target health.

**Skeleton desync.** `dashboard/app/loading.tsx` had a hardcoded 9-element array. It now
renders from `PANEL_LAYOUT` in `dashboard/app/lib/types.ts`. Note honestly: this
centralizes the list but does **not** make it compile-time-enforced — `dashboard.tsx`
still hand-lists its panels. The planned dashboard redesign collapses both into one list.

---

## 3. What is NOT done — your work

### 3.1 PRIMARY TASK: `scripts/local_stack.py`

**The goal Khoi stated: he must be able to run and test the entire pipeline on his machine
against the DEV Supabase project, before spending a cent of the $50 AWS budget.**

I designed this but did not write it. Build it as a single script that replaces **only the
three AWS clients** and reuses the production modules unchanged:

| AWS thing | Local substitute |
|---|---|
| S3 | a directory tree under `--root` (default `.local/s3`) |
| DynamoDB | one JSON file under `--root` |
| Glue/PySpark | `compute_aggregates()` called in-process |
| Athena | see below |
| Secrets Manager | a tiny object reading env vars |

Everything else must be the real code: `extract_core.run_extraction`, `transforms.compute_aggregates`,
`loader_core.resolve_load_context` / `load_aggregates`, and the API handlers
`metrics.handle`, `runs.handle`, `athena.handle`, `insight.handle`. **Do not reimplement
business logic** — if you find yourself copying a transform, stop and inject a client instead.

Required pieces:

1. **`LocalS3`** with `put_object(Bucket, Key, Body, ContentType=, Metadata=)`,
   `get_object(Bucket, Key) -> {"Body": BytesIO}`, and
   `list_objects_v2(Bucket, Prefix, ContinuationToken=)` returning
   `{"Contents": [{"Key", "LastModified"}], "IsTruncated": False}`.
   `LastModified` must be real — `loader_core.latest_manifest_key` now depends on it.

2. **`LocalTable`** with `put_item`, `get_item(Key, ConsistentRead=)`, `update_item`, and
   `query`. `update_item` must actually apply the `SET` expression (resolve `#names` and
   `:values`); only two expression shapes exist in the codebase, both plain comma-separated
   `SET` lists. `query` only ever sees
   `#metric = :metric AND #date BETWEEN :from_date AND :to_date` — implement that shape and
   raise loudly on anything else rather than silently returning nothing.

3. **A local transform** mirroring `glue/job.py` *without* PySpark: read the manifest, read
   each listed JSONL, assert the manifest row counts match (job.py does), write a curated
   stand-in, then write `compute_aggregates()` output to
   `aggregates/dt=<date>/run=<run_id>/<metric>.json`. Keep the key layout identical or the
   loader will not find it.

4. **Orchestration** mirroring the real async chain: `run_extraction` (with a Glue client
   that only *records* the `start_job_run` call), then the transform, then
   `resolve_load_context` + `load_aggregates` with a synthesized
   `{"detail": {"state": "SUCCEEDED", "arguments": {...}}}` event. Run it in a background
   thread when triggered by `POST /runs`, so phase transitions are actually observable.

5. **An HTTP server** on `--port` (default 8000) speaking the same contract as API Gateway,
   dispatching into the real handlers. Routes, confirmed against `infra/data-stack.yaml`
   `PathPart` values and `dashboard/app/lib/api.ts`:
   - `GET  /metrics/{metric}?from=&to=` → `metrics.handle(event, table)`
   - `POST /runs` → `runs.handle(event, table=, lambda_client=, function_name=)`
   - `GET  /runs/{run_id}` → `runs.handle(event, table=)`
   - `POST /athena/query`, `GET /athena/query/{id}` → `athena.handle(...)`
   - `POST /insight/weekly` → `insight.handle(event, table=, secrets_client=, http_client=, secret_arn=)`

   Synthesize the API Gateway event shape the handlers expect: `httpMethod`,
   `pathParameters`, `queryStringParameters`, `body`, `isBase64Encoded`. Return the
   handler's `statusCode`/`headers`/`body` verbatim — do not post-process. If
   `DASHBOARD_TOKEN` is set, require `Authorization: Bearer <token>` and return 401
   otherwise, so the auth contract is exercised too.

6. **Athena locally.** Default behaviour must be an honest `501` with a message saying
   Athena runs only on AWS. Optionally add `--athena-stub` for UI work, and if you do, the
   response payload must carry an unmistakable `"local_stub": true` marker. Never let a
   stub result reach a screenshot that could be mistaken for AWS.

7. **CLI**: `--root`, `--reset`, `--once` (one pipeline pass then exit, printing per-view
   row counts and the metrics loaded), `--serve` (run the API server), `--port`.

8. Add a short `## Local end-to-end` section to `scripts/README.md`.

Write the file with a module docstring that states plainly **what this cannot prove**: IAM
and LabRole assumability, real Parquet output, Athena SQL correctness, EventBridge wiring,
ECR/Fargate/ALB. Those need Session 0 on real AWS.

### 3.2 SECONDARY: Blocker 9 — Athena has no end-to-end path

`infra/data-stack.yaml` defines catalog tables for only 3 of the 7 views, `lambdas/api/athena.py`
has 3 fixed SQL templates (macro / locale / latency), and **the dashboard has no Athena
client or panel at all** — so a graded service is currently undemonstrable. Add the missing
catalog tables and a dashboard panel that starts a query, polls it, and renders the result,
including its failure and timeout states. Note that the three existing SQL templates were
written against `dt`-partitioned tables that no longer have partitions; re-read them.

### 3.3 Documentation drift (flagged, not scheduled)

`docs/solution-architecture.md` and `docs/tutor-reproposal.md` still describe 7 views,
12 aggregates, and 9 panels, and their "current gaps" sections are stale. Do not rewrite
them without asking — they are graded artifacts and the tutor re-proposal is an unresolved
external dependency.

---

## 4. Prerequisites Khoi must do before you can test (ask him; do not attempt yourself)

Against the **DEV** Supabase project (`[DEV] Kallo`, ref `jqgmcnlfxzzhrvrzpoye`) — *not*
prod (`oudpzhfzirgjbhrzcett`):

1. Apply `supabase/migrations/0001_analytics_schema.sql`.
2. Replace the pepper placeholder (`supabase/README.md` §2).
3. Add `analytics` to **Exposed schemas** in Project Settings → Data API. Without this,
   every request returns `PGRST106`.
4. Mint the `analytics_reader` JWT (`supabase/README.md` §4, `expiresIn:'120d'`) and verify
   the expiry with the §5 snippet. **He does this; the signing secret never reaches you.**

Then he exports, and you consume only these:

```sh
export SUPABASE_URL='https://jqgmcnlfxzzhrvrzpoye.supabase.co'
export ANALYTICS_READER_JWT='<the minted restricted token>'
export SUPABASE_API_KEY='<publishable or legacy anon key>'
export DASHBOARD_TOKEN='<any local value, ≥20 chars>'
export GEMINI_API_KEY='<optional; only for the weekly-summary test>'
```

Sanity-check the credentials before building anything else, with the curl in
`supabase/README.md` §5. If it fails, stop and report — do not work around it.

---

## 5. What to test end to end

Run the existing suite first and confirm the numbers in §2 still hold. Then:

### 5.1 Pipeline correctness (terminal)

1. `scripts/local_stack.py --reset --once` against DEV Supabase. Record the row count per
   view. Cross-check at least two against the source with a direct query. **DEV is not
   prod** — expect small or empty tables, and say so plainly rather than treating an empty
   view as a bug.
2. **Run it twice on the same day.** This is the whole point of blocker 4. Verify the two
   runs produced disjoint `run=` prefixes under `raw/` and `aggregates/`, that the second
   load ingested only its own aggregates, and that the dashboard shows the second run's
   numbers — not blanks, and not a mixture.
3. Delete one metric from the second run's aggregate directory before loading and confirm
   the loader still loads cleanly rather than resurrecting the first run's copy.
4. Corrupt one aggregate file to invalid JSON and confirm **nothing** is written to the
   table and the run ends `failed` — no partial writes.
5. Confirm no key anywhere contains `_watermark#`. That machinery is gone.

### 5.2 Dashboard, via computer use

Start the local API and `npm run dev` in `dashboard/` with `MOCK_API=0` and
`API_BASE_URL=http://localhost:8000`. Then drive a real browser:

1. Load the page. Every panel renders from real DEV data or an honest empty state. No
   panel may show mock data while claiming to be live — check the "Mock data" badge is
   absent.
2. Press **Run pipeline now**. The phase must move `queued` → `extracting` →
   `transform_started` → `completed` and the button must re-enable at the end.
3. **Kill the local API server mid-poll.** The UI must show a retry notice, tolerate two
   failures, and only then show a terminal error. It must not die on the first blip. This
   is the regression the change was written for — verify it actually behaves this way.
4. **Force a failure** (point the extractor at a bad URL, or make the transform raise).
   The run must reach a terminal `failed` phase with a reason, and polling must stop.
5. Confirm the match-rate panel's subtitle names its denominator, and that
   `unaccounted_count` is present in the payload.
6. Take screenshots at each step. Label them local — they are not AWS evidence.

### 5.3 What you cannot verify locally — say so explicitly in your report

LabRole assumability, `iam:PassRole` from CloudFormation, real Parquet output and its
schema, Athena SQL, ECR push with session credentials, the Fargate pull, ALB target health,
EventBridge scheduling, and actual cost. All of that is Session 0
(`scripts/session-zero-probe.sh`), and Khoi runs it with his lab credentials.

---

## 6. Working agreement

- Verify before claiming. If a test did not run, say it did not run. If something is
  partially working, say which part. Do not report a self-assessment as a result.
- Surface tradeoffs instead of picking silently; if two readings of a requirement lead to
  materially different work, ask.
- Keep changes surgical — match the surrounding style, do not refactor adjacent code, and
  do not delete pre-existing dead code without flagging it first.
- Simplicity first: no speculative abstraction, no configurability nobody asked for, no
  error handling for impossible states.
- Nothing is committed. Do not commit or push without being asked; if you do commit, branch
  first — the current branch state matters.
