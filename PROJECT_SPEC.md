# Kallo Analytics Plane on AWS — Project Spec

Analytics/ops dashboard for kallo.fit (live calorie-tracking app; prod = GCP Cloud Run + Supabase Postgres), built on AWS for RMIT Cloud Computing Assessment 3. Read this whole file before implementing any chunk. Deviations from this spec require flagging, not silent improvisation.

## Hard environment constraints (AWS Academy Learner Lab)

- **$50 total budget. Exceeding it DELETES the AWS account.** Every resource choice must be justified against this.
- Region: **us-east-1 only**.
- **No IAM user/role/policy creation.** Use the pre-existing role `LabRole` (ARN pattern `arn:aws:iam::${AWS::AccountId}:role/LabRole`) and instance profile `LabInstanceProfile` everywhere a role is needed. CloudFormation templates must NEVER contain `AWS::IAM::Role` or `AWS::IAM::Policy` resources — reference LabRole by ARN.
- ECS: LabRole as BOTH task role and task execution role. EC2-ish instance sizes capped at nano/micro/small/medium/large.
- Glue: worker type G.1X or Standard, max workers 10 (we use **2**), max concurrency **1**.
- Lambda: max 10 concurrent executions account-wide — set conservative reserved concurrency.
- ECR: LabRole is read-only; images are PUSHED with the operator's federated session credentials, PULLED by tasks via LabRole. Don't design around role-based push.
- CloudFront, Cognito, Amplify are NOT available. Do not use them.
- No `AWS::EC2::VPC` creation needed — everything runs outside a VPC except ECS/ALB which use the **default VPC public subnets** (imported as parameters).

## Current architecture

```
EventBridge (daily) ──▶ Lambda extract ──▶ Supabase REST API (analytics schema, restricted key)
                              │ writes JSON
                              ▼
                    S3 raw/<table>/dt=YYYY-MM-DD/  + manifest.json
                              │ exactly ONE StartJobRun after manifest
                              ▼
                    Glue job (PySpark, S3→S3): raw JSON → curated/ Parquet + aggregates/
                              │ on success (EventBridge Glue state-change rule)
                              ▼
                    Lambda loader ──▶ DynamoDB (idempotent upserts, PK=metric, SK=date)
                              
Dashboard (Next.js on Vercel permanently; ECS Fargate + ALB for AWS evidence)
   ├▶ API Gateway (Lambda authorizer: static bearer token; usage plan quotas)
   │    ├▶ Lambda metric/run handlers ──▶ DynamoDB aggregate reads
   │    └▶ Lambda monitoring collector ──▶ Google Cloud Monitoring API
   │                                      └▶ DynamoDB 120-second cache
   └▶ Supabase bounded RPC (exact AI-meal traces only)
```

Two CloudFormation stacks + one probe stack:
1. `infra/data-stack.yaml` (persistent, low-cost): S3 bucket, DynamoDB table (on-demand + TTL), Glue job, six Lambdas, API Gateway, EventBridge schedule + Glue-success rule, and Secrets Manager values for Supabase, the Google Monitoring reader, and the dashboard bearer token.
2. `infra/presentation-stack.yaml` (disposable, created per work session/demo): ALB + target group + security groups + ECS cluster/service/task definition. Takes image URI + default-VPC/subnet IDs as parameters. Deleting it must leave zero billable residue.
3. `infra/probe-stack.yaml` (historical Session-0 evidence): proved Learner Lab capabilities before implementation. It is not a current application dependency.

## Cost guards (mandatory in templates/code)

Glue: `NumberOfWorkers: 2`, `WorkerType: G.1X`, `Timeout: 10` (minutes), `MaxRetries: 0`, `ExecutionProperty.MaxConcurrentRuns: 1`. Lambda: timeout ≤ 120s (extract may need 300s), memory ≤ 512MB, reserved concurrency ≤ 2 per function and 8 total. DynamoDB: PAY_PER_REQUEST with TTL for external-metric cache items. API Gateway: 2 requests/second, burst 5. No NAT gateways, no VPC endpoints, no Lambda VPC config.

## Source data (Supabase → `analytics` schema sanitized views)

The extract Lambda reads ONLY these views (the analytics migrations create them). Field allowlists are exact — no `SELECT *` anywhere:

| View | Source table | Columns (allowlist) |
|---|---|---|
| `analytics.v_pipeline_runs` | `pipeline_runs` | id, created_at, pipeline_version, model_call1, model_call2, total_ms, ingredient_count, matched_count, unmatched_count, retry_count, escalated, cache_hit_l4 |
| `analytics.v_budget_events` | `analysis_model_budget_events` | id, created_at, request_id, route, work_kind, provider, model, request_count, input_tokens, output_tokens, error_category |
| `analytics.v_meals` | `meals` | id, user_hash (HMAC of user_id), logged_at (truncated to hour), calories_kcal, protein_g, carbohydrate_g, fat_g |
| `analytics.v_food_composition` | `vietnamese_food_composition` | id, name_en, type_en, state, source_id, serving_size_g, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g |
| `analytics.v_app_health` | `product_telemetry_events` | event_id, occurred_at, platform, app_version, event_name, route (stable key), metric, check, status_code, duration_ms, fatal |
| `analytics.v_ingredient_decisions` | `v_verdict_pool` + candidate pool JSON | decision_key (domain-separated HMAC), occurred_on, ingredient_query, verdict, pool_size, selected_rank, reject_bucket, candidate ranks 1–3 (canonical food id/name/source/similarity), chosen canonical food id/name/source/similarity |

Excluded everywhere: raw input, emails, free-text feedback, stack traces, error messages, raw user IDs, actor/session/anonymous identifiers in health data, onboarding state, screen journeys, meal entry mode, meal slot, and request-to-meal correlation. The only person-related field retained is the HMAC `user_hash` used inside Glue to compute aggregate DAU/WAU; it is never emitted in an aggregate or shown in the dashboard.

Extraction: **every view is a full snapshot** — no watermarks, no cursors, no cross-run state. Each run pages the complete view (page size 1000 via PostgREST `Range` headers, ordered by each view's configured primary timestamp/key plus an opaque tie-breaker for deterministic paging) and recomputes every aggregate from the whole dataset. After ALL views extracted, write `raw/_manifests/dt=<date>/manifest.json` listing files and row counts, then exactly one `glue.start_job_run(Arguments={"--run_id": ..., "--manifest": ...})`.

The final reduction migration retires the product-event, user-funnel,
meal-item, unmatched-query, and pipeline-to-meal views. `v_app_health` remains
as a controlled operational source without actor/session identifiers or raw
diagnostic payloads. `v_ingredient_decisions` retains bounded food-domain labels
and catalogue identifiers because those fields are the object of the quality
analysis. These operational views enforce a rolling 90-day source cutoff in
SQL before extraction. Raw and curated S3 retention remains a separate
operational policy.

Rationale (decided 2026-08-22): incremental watermarking was removed because it was unsafe at this scale and silently lossy. A `gt.<watermark>` cursor skips every row sharing the watermark's value (fatal on any coarsened timestamp); watermarks committed per-view before the run completed, so a later-view failure stranded earlier rows permanently; and a second same-day run produced an empty delta whose aggregates overwrote the good ones, blanking the dashboard while reporting success. The full relevant dataset is a few MB (~10-20 pages), so a snapshot costs nothing and removes the entire failure class. Reintroduce incremental only if a single view exceeds roughly 100k rows, and only with a composite keyset cursor plus staged watermarks committed after a successful load.

## Dashboard scope (13 aggregates, all served from DynamoDB unless noted)

1. `dau_wau`: aggregate usage context; an actor is active on a UTC day when they logged a meal. Display both the latest values and a line chart.
2. `macro_distributions`: calorie, protein, carbohydrate, and fat histograms for detecting abnormal clusters at a glance.
3. `ai_latency`: daily model call count and p50/p95/p99 latency, displayed as lines over time.
4. `ai_failure_rate`: daily provider/model failure observations and a weighted-rate line.
5. `token_cost_daily`: daily input/output token trends plus exact known-price estimates.
6. `match_rate`: daily ingredient match-quality line.
7. `implausible_foods`: food catalogue records violating the three fixed plausibility rules.
8. `app_health`: controlled hourly crash, API failure, performance, and health-check buckets.
9–13. `ingredient_demand`, `ingredient_mappings`, `corpus_reverse_lookup`, `ingredient_gaps`, and `ingredient_rank_distribution`: bounded catalogue demand, decision, reverse-lookup, gap, and candidate-rank diagnostics.

Funnels, retention cohorts, journey transitions, feature adoption, onboarding,
meal-slot/entry-mode trends, top-food reporting, and pipeline-to-meal conversion
are deliberately outside the beta assignment scope.

The AI page adds one bounded Supabase RPC for exact trace detail. The System page uses Google Cloud Monitoring for app-wide request latency, traffic, 5xx, startup, CPU, memory, and instance metrics. A "Run pipeline now" button calls `POST /runs`, receives a run ID, and polls `GET /runs/{id}`.

The complete operational contract is recorded in
`docs/product-analytics-aggregates.md`. Metrics are descriptive and do not
interpret beyond observed counts.

## Conventions

- Python 3.12 Lambdas, boto3, no heavy deps (requests OK via layer or urllib3). Type hints. `tests/` with pytest against sample fixtures shaped like the real views.
- Glue script: PySpark, must also run under `pytest` for the pure-transform functions (separate transform module imported by the Glue entrypoint).
- Dashboard: Next.js 15 App Router, TypeScript, standalone output, Recharts, Tailwind. Dockerfile `--platform=linux/amd64`; task definition `RuntimePlatform: {CpuArchitecture: X86_64}`. `API_BASE_URL` + bearer token via env.
- Secrets only via Secrets Manager / env; NEVER commit keys. `.env.example` documents needed vars.
- Every borrowed code snippet gets an IEEE-style reference in a comment (assignment requirement).
- Academic-integrity note: comments should be plain and explainable — the author must defend this code in a live 30-min Q&A.

## Acceptance criteria per chunk

Defined in the task prompt given per chunk; global bar: `cfn-lint` clean on all templates, `pytest` green, dashboard `next build` succeeds, no IAM resources in templates, cost guards present exactly as specified above.
