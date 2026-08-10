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

## Architecture (locked — do not redesign)

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
                              
Dashboard (Next.js on ECS Fargate, public subnet, behind ALB)
   └▶ API Gateway (Lambda authorizer: static bearer token; usage plan quotas)
        └▶ Lambda api handlers ──▶ DynamoDB reads
                                ──▶ Athena StartQueryExecution (fixed templates only, async run-id/poll)
                                ──▶ Gemini API (weekly insight summary over aggregates)
```

Two CloudFormation stacks + one probe stack:
1. `infra/data-stack.yaml` (persistent, pennies/month): S3 bucket (raw/curated/athena-results prefixes, lifecycle: athena-results expire 7 days), DynamoDB table (on-demand), Glue job + Glue Data Catalog database + crawler-or-explicit tables, Athena workgroup (bytes-scanned cutoff 1GB, enforced), Lambdas, API Gateway, EventBridge schedule + Glue-success rule, Secrets Manager secrets (Supabase URL+key, Gemini key, dashboard bearer token — values injected at deploy, never committed).
2. `infra/presentation-stack.yaml` (disposable, created per work session/demo): ALB + target group + security groups + ECS cluster/service/task definition. Takes image URI + default-VPC/subnet IDs as parameters. Deleting it must leave zero billable residue.
3. `infra/probe-stack.yaml` (Session-0): minimal proof that LabRole is assumable by Lambda/Glue/ECS/EventBridge/Scheduler, PassRole works from CloudFormation, Secrets Manager readable from Lambda, one Athena query + one 2-worker Glue run completes.

## Cost guards (mandatory in templates/code)

Glue: `NumberOfWorkers: 2`, `WorkerType: G.1X`, `Timeout: 10` (minutes), `MaxRetries: 0`, `ExecutionProperty.MaxConcurrentRuns: 1`. Athena workgroup: `BytesScannedCutoffPerQuery`, `EnforceWorkGroupConfiguration: true`. Lambda: timeout ≤ 120s (extract may need 300s), memory ≤ 512MB, reserved concurrency ≤ 2 per function. DynamoDB: PAY_PER_REQUEST. No NAT gateways, no VPC endpoints, no Lambda VPC config, ever.

## Source data (Supabase → `analytics` schema sanitized views)

The extract Lambda reads ONLY these views (chunk 2 creates them). Field allowlists are exact — no `SELECT *` anywhere:

| View | Source table | Columns (allowlist) |
|---|---|---|
| `analytics.v_pipeline_runs` | `pipeline_runs` | id, created_at, pipeline_version, model_call1, model_call2, total_ms, ingredient_count, matched_count, unmatched_count, retry_count, escalated, cache_hit_l4 |
| `analytics.v_budget_events` | `analysis_model_budget_events` | id, created_at, request_id, route, work_kind, provider, model, request_count, input_tokens, output_tokens, error_category |
| `analytics.v_meals` | `meals` | id, user_hash (HMAC of user_id, computed in view with a dedicated analytics pepper), logged_at (truncated to hour), meal_slot, entry_mode, confidence_overall, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g |
| `analytics.v_meal_items` | `meal_items` | id, meal_id, ingredient_name, food_composition_id, estimated_grams, match_confidence, cooking_method, created_at |
| `analytics.v_unmatched_ingredients` | `unmatched_ingredients` | id, query_text, created_at |
| `analytics.v_user_funnel` | `user_profiles` | user_hash (HMAC), created_at (date-truncated), onboarding_step, onboarding_completed_at (date-truncated), goal, preferred_locale |
| `analytics.v_food_composition` | `vietnamese_food_composition` | id, name_en, type_en, state, source_id, serving_size_g, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g |

Excluded everywhere: `raw_input`, emails, free-text feedback, exact timestamps where truncation suffices, raw `user_id`. `ingredient_name`/`query_text` are food names (needed for top-foods/coverage panels) — they stay, but any view must filter rows where the app flagged PII (none currently do; keep the note).

Extraction: incremental per-table watermark (`created_at`/`logged_at` cursor) stored in the DynamoDB table under `metric="_watermark#<view>"`; page size 1000 via PostgREST `Range` headers; full-refresh mode flag for small dimension views (`v_food_composition`). After ALL views extracted, write `raw/_manifests/dt=<date>/manifest.json` listing files+row counts, then exactly one `glue.start_job_run(Arguments={"--run_id": ..., "--manifest": ...})`.

## Dashboard panels (9, all served from DynamoDB aggregates unless noted)

1. DAU/WAU + retention cohorts — engagement-defined (a user is active on a day they logged a meal). State this definition in UI + doc.
2. Meal-log volume over time (by slot, entry_mode).
3. Macro distributions (calories/protein/carb/fat histograms).
4. Top logged foods (from meal_items.ingredient_name; food_composition join for names).
5. AI latency by model + failure rate (failure from budget-event error_category; latency p50/p95 from pipeline_runs.total_ms).
6. Token cost per day, stacked by model (budget_events tokens × per-model price table in code).
7. Match-rate trend (matched_count vs unmatched_count).
8. Onboarding funnel (step 0→3 conversion).
9. Coverage gaps: unmatched_ingredients ranked by frequency + implausible-nutrition table (rules: kcal>0 but all macros 0; carb-staple types with carbohydrate_g=0; 4/4/9 macro-vs-calorie mismatch >40%). No new anomaly framework.

Plus: "Weekly summary" panel calling the Gemini endpoint, and a "Run pipeline now" button → POST /runs → run_id → poll GET /runs/{id}.

## Conventions

- Python 3.12 Lambdas, boto3, no heavy deps (requests OK via layer or urllib3). Type hints. `tests/` with pytest against sample fixtures shaped like the real views.
- Glue script: PySpark, must also run under `pytest` for the pure-transform functions (separate transform module imported by the Glue entrypoint).
- Dashboard: Next.js 15 App Router, TypeScript, standalone output, Recharts, Tailwind. Dockerfile `--platform=linux/amd64`; task definition `RuntimePlatform: {CpuArchitecture: X86_64}`. `API_BASE_URL` + bearer token via env.
- Secrets only via Secrets Manager / env; NEVER commit keys. `.env.example` documents needed vars.
- Every borrowed code snippet gets an IEEE-style reference in a comment (assignment requirement).
- Academic-integrity note: comments should be plain and explainable — the author must defend this code in a live 30-min Q&A.

## Acceptance criteria per chunk

Defined in the task prompt given per chunk; global bar: `cfn-lint` clean on all templates, `pytest` green, dashboard `next build` succeeds, no IAM resources in templates, cost guards present exactly as specified above.
