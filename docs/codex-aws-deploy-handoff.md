# Codex handoff — deploy the Kallo analytics plane to AWS Learner Lab

You are deploying real infrastructure into a live AWS account with a hard budget
that **deletes the account** if exceeded. Read this entire file before running
anything. Work in `~/Documents/kallo-aws-analytics` (confirm with `pwd` and
`git log --oneline -1`; you want `718534c` or later — `git pull` if behind).

## 1. Context

An analytics plane on AWS over **kallo.fit**, a live Vietnamese calorie-tracking
app whose production runs on GCP Cloud Run + Supabase — *not* on AWS. This is
**RMIT Cloud Computing Assessment 3**: 40% of the grade, due 2026-09-12, with a
live 30-minute demo where Khoi must defend every line. He is new to AWS.

Architecture (locked — do not redesign):

```
EventBridge (daily) → Lambda extract → Supabase REST (analytics schema, restricted JWT)
  → S3 raw JSONL → Glue PySpark → S3 curated Parquet + aggregates
  → Lambda loader → DynamoDB → API Gateway (+ Lambda authorizer) → Lambdas
  → Next.js dashboard on ECS Fargate behind an ALB
Athena queries the curated Parquet directly.
```

## 2. Environment facts (verified 2026-08-28)

| Fact | Value |
|---|---|
| AWS account | `902339462666` |
| Region | `us-east-1` — **only**; resources elsewhere are invisible to everything |
| Scratch bucket | `s3://kallo-lab-scratch-902339462666` (already exists) |
| Data stack name | `kallo-data` |
| Presentation stack name | `kallo-presentation` |
| Identity | `assumed-role/voclabs/...` — federated session creds, NOT `LabRole` |

**Session 0 is complete and passed** — see `docs/session-zero-results.md`. Every
Learner Lab assumption held, including ECR push with session credentials,
`LabRole` pulling into Fargate, and ALB health. The probe stack was deleted. Do
not re-run it.

## 3. Hard constraints — violating any is a task failure

1. **USD 50 total budget. Exceeding it deletes the account and all work.** The
   ALB is the only hourly-billed resource (~$0.025/hr). Never leave the
   presentation stack up. Never create a NAT gateway, RDS instance, or anything
   with a standing hourly charge.
2. **No IAM resources, ever.** Learner Lab forbids creating roles or policies.
   Every service role is the pre-existing `LabRole`. If a template needs
   `AWS::IAM::Role`, the design is wrong — stop and report.
3. **Never print, log, echo, or paste secrets** — the Supabase key, Gemini key,
   dashboard bearer token, or the contents of `~/.aws/credentials`. Pass them as
   environment variables only. Never commit them. Never write them into a file
   in the repo.
4. **Never `git push` or commit** without Khoi's explicit say-so on that commit.
5. **Do not touch the CloudFormation stack named `c221402a5583325l...`** — that
   is the Learner Lab's own bootstrap stack.
6. **Region is `us-east-1`.** Do not change it.
7. Lab credentials expire when the session ends. When AWS calls start failing
   with expired-token errors, stop and ask Khoi to refresh — do not improvise.

## 4. Conduct rules

- **Verify, never assume.** Do not report a step as done because a command
  exited 0. Prove it: query the resource, read the stack output, fetch the URL.
  A CloudFormation `CREATE_COMPLETE` is evidence; a script that printed nothing
  is not.
- **Report failures verbatim.** Paste the actual error text. Do not summarise an
  error as "it didn't work".
- **Never present simulated or expected output as real.** If you could not run
  something, say so plainly.
- **Ask Khoi rather than guessing** on anything involving money, secrets, or
  destructive actions.
- Prefer the **terminal** for everything. Use computer use only where §7 says.

## 5. Known environment gotchas

- **zsh eats docker tags.** `docker push $VAR:tag` silently pushes `:latest`
  because `:s`/`:t` are zsh parameter modifiers. Always brace: `${VAR}:tag`.
- **`--platform linux/amd64` is mandatory** for every image build. The Mac is
  ARM, Fargate is x86. Without it the image builds and pushes fine, then the
  task dies with `exec format error`.
- **Athena workgroups with `EnforceWorkGroupConfiguration: true` ignore
  client-supplied output locations.** The workgroup itself must define one.
- **CloudShell is available** in this lab, pre-authenticated. It cannot run
  Docker.

## 6. The work, in order

Do these one at a time. Report after each and wait for Khoi before continuing to
the next numbered step.

### 6.1 Prerequisites you must get from Khoi (do not attempt yourself)

Ask him to export these in the shell you will use. He mints the Supabase JWT
himself — the project signing secret must never reach you or any agent.

```
export SUPABASE_URL='https://jqgmcnlfxzzhrvrzpoye.supabase.co'
export SUPABASE_KEY='<restricted analytics_reader JWT>'
export GEMINI_API_KEY='<gemini key>'
export DASHBOARD_BEARER_TOKEN='<20-128 chars>'
```

Before deploying, have him confirm the JWT outlives the deadline — the assertion
command is in `supabase/README.md`. A token expiring before 2026-09-12 silently
kills the daily automation, which is exactly what the rubric grades.

Also confirm `aws sts get-caller-identity` returns account `902339462666`.

### 6.2 Deploy the data stack

This is 59 resources: S3, DynamoDB, Glue database and job, Athena workgroup,
17 Lambdas, API Gateway with a Lambda authorizer, EventBridge schedule, and
three Secrets Manager secrets. It is serverless and near-free at rest.

```
scripts/deploy-data-stack.sh --glue-script-s3-uri s3://kallo-lab-scratch-902339462666/glue/job.py
```

The script uploads `glue/job.py` and `glue/transforms.py`, deploys the stack,
waits for completion, then packages and publishes every Lambda ZIP.

**Verify before reporting success:** stack status is `CREATE_COMPLETE`; the
Outputs tab lists the API URL and function names; `aws lambda get-function` on
one function shows a code size greater than the template's placeholder.

### 6.3 First pipeline run

Invoke the extract Lambda manually and follow the chain. Expect: objects under
`raw/` in the analytics bucket, a manifest, one Glue run reaching `Succeeded`,
`curated/` Parquet, and items in the DynamoDB table.

**Verify:** list the S3 prefixes, read the Glue run state, and scan a couple of
DynamoDB items. Report the actual counts. If the Glue job fails, get its error
from CloudWatch logs and paste it verbatim — do not retry blindly.

### 6.4 Test the API

Call the API Gateway endpoint with the bearer token. Confirm a 200 with real
aggregate JSON, and confirm a request **without** the token returns 401/403 —
the authorizer working is a graded claim.

### 6.5 Build and push the dashboard image

```
scripts/push-image.sh
```

Builds `dashboard/` for `linux/amd64`, creates the `kallo-dashboard` ECR repo if
needed, pushes, and records the URI in `.lab-config` (gitignored — keep it that
way).

### 6.6 Presentation stack — only when Khoi is ready to look at it

```
scripts/lab-up.sh
```

Prints the ALB URL. **This starts hourly billing.** Confirm the dashboard loads
and renders real data from DynamoDB, capture evidence (§7), then immediately:

```
scripts/lab-down.sh
```

Never end a session with the presentation stack up. If you are unsure whether it
is up, check and say so explicitly.

## 7. Where computer use is actually needed

Everything above is terminal work. Use computer use for exactly these:

1. **Lab credentials** — Khoi clicks Start Lab → AWS Details → Show and pastes
   the block into `~/.aws/credentials` himself. You may guide, but do not read
   or transcribe the values.
2. **Vocareum budget readout** — read the spend figure at session start and
   session end, and report both. This is the only place the real cost is
   visible, and the plan requires recording it.
3. **Evidence screenshots for the submission** — captured from the real
   deployment, never mocked: the ALB-served dashboard, a `CREATE_COMPLETE`
   stack, S3 prefixes and manifest, a successful Glue run, DynamoDB items,
   the EventBridge rule, API Gateway routes, an Athena query result, and the
   budget view. Save them under `docs/doc_images/`.

## 8. Known-open work (do not start without asking)

- **Blocker 9 — Athena has no end-to-end path.** Only three catalog tables
  exist and the dashboard has no Athena start/poll client. Athena is worth 3
  marks and must be demonstrable.
- **Blocker 10 — run-now has no failure path.** The first poll error is
  terminal, there is a 404 race, and no terminal `failed` state exists.

## 9. What to report back

For each step: the exact command, the real output (secrets redacted), what you
verified and how, and anything that surprised you. If a step failed, stop —
do not proceed to the next one. State plainly what you could not verify.
