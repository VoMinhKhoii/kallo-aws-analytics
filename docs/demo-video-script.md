# Kallo Analytics Plane - 10-minute demo video script

Target duration: **9:30**. Hard stop: **10:00**.

The recording should show the product on the left (about 60% width) and AWS Management Console on the right (about 40%). The product performs every operation. AWS Console is evidence that the corresponding managed component received, stored, or processed it.

## 1. Recording setup

### Before recording

1. Renew AWS Learner Lab credentials and select **N. Virginia (`us-east-1`)** in every AWS tab.
2. Deploy `kallo-data` and start the disposable `kallo-presentation` stack. Confirm both stacks are healthy.
3. Open the dashboard from the **`kallo-presentation` LoadBalancerDnsName** so the recording proves the client is deployed on AWS. Keep Vercel only as a backup link.
4. Sign in as founder in the AWS-hosted dashboard. Keep reviewer credentials available for the short access-control demonstration.
5. Make one recent meal-analysis request in Kallo so Trace Viewer and the System route histogram have fresh evidence.
6. Ensure the 30-minute manual-run guard has expired. Do not trigger a test snapshot immediately before recording.
7. Set browser zoom to 80-90%. Hide bookmarks, notifications, account IDs, secret values, and unrelated tabs.
8. Open the following AWS tabs in this order:

   - CloudFormation -> Stacks -> `kallo-presentation` -> Resources
   - ECS -> Clusters -> the physical ID of `DashboardCluster` -> Services/Tasks
   - EC2 -> Load Balancers -> the physical ID of `DashboardLoadBalancer`
   - CloudFormation -> Stacks -> `kallo-data` -> Resources
   - API Gateway -> `kallo-data-analytics-api` -> Resources
   - DynamoDB -> Tables -> the physical ID of `AnalyticsTable` -> Explore table items
   - S3 -> the physical ID of `AnalyticsBucket`
   - AWS Glue -> ETL jobs -> the physical ID of `AnalyticsGlueJob` -> Runs
   - Lambda -> Functions, filtered by `kallo-data`
   - EventBridge -> Rules, filtered by `kallo-data`
   - Secrets Manager -> Secrets, filtered by the `Project=kallo-analytics` tag

Use the CloudFormation **Resources** tabs as the directory of truth. Click a resource's physical ID instead of trying to memorize generated names.

### Safety rules

- Never reveal a secret value, JWT, bearer token, password, service-account JSON, or `.env` file.
- Do not open the disabled Athena compatibility Lambda. Athena is not part of the claimed solution.
- Do not invoke Lambda, Glue, or EventBridge manually from AWS Console. The rubric requires client/code/service automation.
- If a live extract is still running near the end, show its current phase and one earlier successful Glue run. Do not wait silently.
- Keep the mouse still while speaking. Move it only when the script says **Action**.

## 2. Timed presentation script

### 0:00-0:35 - Purpose and architecture

**Left - Action:** Show the report's runtime architecture diagram or the dashboard login page.

**Right - Action:** Show CloudFormation -> `kallo-data` -> Resources.

**Say:**

> Kallo Analytics Plane is a private operator console for understanding meal-analysis quality, AI performance, exact bounded traces, and Cloud Run system health. The data plane is provisioned by CloudFormation. Product actions invoke the services automatically; I use AWS Console only to prove which managed component performs each step. The persistent stack is `kallo-data`, while `kallo-presentation` is a temporary AWS presentation tier to control ALB and Fargate cost.

### 0:35-1:15 - AWS-hosted client and access control

**Left - Action:** Open the ALB dashboard URL. Briefly sign in as reviewer, show that **Run snapshot** is founder-only, then return to the founder session.

**Right - Action:** In `kallo-presentation` Resources, highlight `DashboardLoadBalancer`, `DashboardCluster`, `DashboardService`, and `DashboardTaskDefinition`. Switch briefly to ECS and show one running Fargate task and healthy service.

**Say:**

> The browser reaches an Application Load Balancer, which forwards to a Next.js container on ECS Fargate. The image comes from ECR. The target group checks `/api/health`. Reviewer sessions are read-only, while founder access is required for the only mutating dashboard action. Credentials are injected from Secrets Manager rather than stored in the image.

**Evidence:** ECS desired/running count `1`, Fargate launch type, healthy ALB target, task definition container named `dashboard`.

### 1:15-2:05 - Today: persisted aggregate overview

**Left - Action:** Open **Today**, change the window from 30 days to 7 days and back, and hover one point in **Recorded AI pipeline latency** and **AI operating cost**.

**Right - Action:** Open DynamoDB -> `AnalyticsTable` -> Explore table items. Filter/query `metric = ai_latency`, then briefly show `token_cost_daily`.

**Say:**

> Today is a read-only overview served from precomputed DynamoDB aggregates. The selected window is sent through API Gateway to the metrics Lambda, which allow-lists the metric and filters its observation dates. Recorded AI pipeline latency is calculated from application-written `pipeline_runs.total_ms`; it is not the complete Cloud Run HTTP latency. Cost is an estimate from observed input and output tokens and configured model rates, not a cloud invoice.

**Evidence:** partition key `metric`, sort key `date`, dated `ai_latency` rows, no user-level fields.

### 2:05-2:55 - AI: calls, failures, tokens, and cost

**Left - Action:** Open **AI**. Hover AI calls, recorded pipeline latency, failure rate, token usage, and operating-cost timelines. Change the window once.

**Right - Action:** Keep DynamoDB visible and query `ai_failure_rate`, then `token_cost_daily`. If time permits, show S3 -> `aggregates/` objects.

**Say:**

> The AI page uses the same persisted aggregate contract. It separates volume, pipeline latency, provider failures, token usage, and estimated cost. Model details are grouped into the timeline tooltip so the charts remain readable. These rows are produced in batch by Glue and loaded idempotently into DynamoDB; a normal page refresh does not rerun Glue.

### 2:55-3:45 - Ingredients: retrieval and coverage in one page

**Left - Action:** Open **Ingredients**. Show match-rate history, demand-to-chosen mapping, candidate bullets, corpus coverage, gaps, and pagination. Hover a line point and change the time window.

**Right - Action:** Open Glue -> the analytics job -> Script/Details, then S3 -> `curated/` and `aggregates/`.

**Say:**

> Ingredients consolidates retrieval, mapping, corpus coverage, gaps, and quality evidence. The extract Lambda writes sanitized Supabase views as run-specific JSON Lines plus a manifest in S3. Glue reads only that manifest, performs deterministic transformations, writes curated Parquet and thirteen aggregate JSON payloads, and the loader writes the complete snapshot to DynamoDB. Glue is therefore a real transformation boundary, not a DTO rename.

**Evidence:** Glue 4.0, two G.1X workers, ten-minute timeout, one concurrent run, no retries; S3 `raw/`, `curated/`, and `aggregates/` prefixes.

### 3:45-4:40 - Trace Viewer: one interpretable meal request

**Left - Action:** Open **Trace Viewer**, click one actual typed meal, and show its dedicated trace page. Expand only two compact stage groups: decomposition and matching/nutrition. Point to stage duration, chosen food, candidates, confidence, and bounded output.

**Right - Action:** Show the ECS task definition's **Secrets** names only, especially the Supabase URL/JWT/key bindings. Do not reveal values. Alternatively show Secrets Manager's list view only.

**Say:**

> This page answers what happened in one meal-analysis request. It shows the bounded text that was actually typed and ordered pipeline stages, without user or session identifiers, prompts, images, or raw model responses. Exact traces intentionally bypass S3, Glue, and DynamoDB: the Next.js server calls an allow-listed Supabase RPC directly because this is a point lookup, not a batch aggregate. Supabase PostgREST/RPC is the first external API integration.

### 4:40-5:55 - System: live Google observability and route split

**Left - Action:** Open **System** and click **Refresh**. Hover non-AI latency, **Cloud Run AI endpoint latency**, request/5xx volume, startup latency, CPU/memory, and average instances.

**Right - Action:** In API Gateway highlight `GET /cloud-monitoring`. Switch to Lambda and open the Cloud Monitoring collector function's Configuration page, then EventBridge's five-minute route-ingestion rule.

**Say:**

> System uses a different path. Refresh calls `/cloud-monitoring` through API Gateway and the collector Lambda. Google Cloud Monitoring supplies request volume, 5xx, startup, CPU, memory, and instance metrics. Google Cloud Logging supplies request durations because Cloud Run's built-in route label is empty. The collector classifies exact `POST /api/analyze-meal` requests as AI and everything else as non-AI, then stores bounded hourly histograms in DynamoDB every five minutes. Google Monitoring and Logging are the second external API integration.

> Cloud Run AI endpoint latency covers the complete HTTP boundary and can include failures before a pipeline row is written. Recorded AI pipeline latency on Today and AI uses `pipeline_runs.total_ms`. Their values are therefore not expected to match.

**Evidence:** API Gateway method uses custom authorization; collector reserved concurrency `1`; EventBridge schedule `rate(5 minutes)`; DynamoDB TTL on `expires_at`.

### 5:55-7:55 - Trigger the full pipeline from the product

**Left - Action:** In System -> **Manual snapshot control**, click **Run snapshot** once. Leave the phase/status visible. Do not click again.

**Right - Actions while the run progresses:**

1. API Gateway: highlight `POST /runs` and `GET /runs/{run_id}`.
2. Lambda: show the Runs function, Extract function, and Loader function in the function list.
3. S3: refresh `raw/` and open the newest run prefix; show JSONL files and `manifest.json` names only.
4. Glue: refresh Runs and show the new running/succeeded execution. If it has not completed, briefly show the latest earlier `SUCCEEDED` run as proof of the same path.
5. Return left and show the dashboard's updated authoritative phase.

**Say:**

> This is the strongest automation proof. The founder action calls API Gateway rather than AWS Console. The Runs Lambda enforces a server-side 30-minute guard and invokes the Extract Lambda. Extract reads six sanitized Supabase views, writes one run-specific S3 manifest, and starts Glue. EventBridge listens for this named Glue job's success and invokes the Loader Lambda. The loader performs idempotent DynamoDB upserts. The dashboard polls `/runs/{run_id}` for the authoritative phase, so changing tabs or browsers cannot bypass the guard.

> A page-level Refresh only re-fetches its direct source or existing aggregate. Run snapshot is different: it creates a new domain snapshot through the complete extract, transform, and load pipeline.

### 7:55-8:50 - Scheduled automation, security, and cost controls

**Left - Action:** Keep the run status visible or return to Today.

**Right - Action:** Show EventBridge rules, API Gateway Stage settings/Usage plan, DynamoDB TTL, and the Secrets Manager list view.

**Say:**

> The same data pipeline is also scheduled daily by EventBridge. Separate Glue-success and Glue-failure rules make the run terminal and prevent incomplete aggregates from replacing the previous good snapshot. The API uses a TOKEN Lambda authorizer, two requests per second with burst five, and a monthly quota. Lambda reserved concurrency, on-demand DynamoDB, bounded histograms, S3 encryption/public-access blocking, and short caches control cost and blast radius. Secrets remain server-side.

**Evidence:** daily extract rule enabled; Glue success/failure rules enabled; usage-plan throttle `2`, burst `5`, quota `10,000/month`; DynamoDB TTL enabled.

### 8:50-9:30 - CloudFormation proof and conclusion

**Left - Action:** Return to the architecture diagram or Today page.

**Right - Action:** Return to CloudFormation -> `kallo-data` -> Resources, then briefly open Template. Show `kallo-presentation` separately.

**Say:**

> Every AWS component shown here is declared through CloudFormation. `kallo-data` owns the persistent serverless analytics plane: Lambda, API Gateway, S3, Glue, DynamoDB, EventBridge, Secrets Manager, and CloudWatch integration. `kallo-presentation` owns the disposable ALB and ECS Fargate client tier. This separation keeps the live evidence reproducible while allowing the hourly presentation resources to be removed after the assessment. The result is an automated, privacy-bounded analytics system with two external APIs and clear batch, direct-query, and operational telemetry paths.

Stop recording by **9:30**. Leave the remaining 30 seconds as safety margin.

## 3. Product-to-AWS console map

| Product page/action | Runtime path | AWS Console evidence page | What it proves |
| --- | --- | --- | --- |
| Open AWS dashboard | Browser -> ALB -> ECS Fargate Next.js container | CloudFormation `kallo-presentation`; EC2 Load Balancers/Target Groups; ECS Cluster/Service/Task | AWS client deployment, health-checked ingress, container execution |
| Login/logout and role check | Next.js signed `HttpOnly` session; secrets injected into task | ECS Task Definition -> Secrets; Secrets Manager list | Server-side authentication configuration without exposing values |
| Today: change window | Next.js -> API Gateway `GET /metrics/{metric}` -> Authorizer -> Metrics Lambda -> DynamoDB | API Gateway Resources; Lambda Metrics function; DynamoDB items | Automated, time-filtered aggregate reads |
| AI: hover/change window | Same aggregate route for `ai_latency`, `ai_failure_rate`, `token_cost_daily` | DynamoDB items; S3 `aggregates/`; Glue job | AI observations are precomputed, persisted, and interpretable |
| Ingredients: paginate/filter | Metrics route -> DynamoDB aggregate pages | DynamoDB items; Glue job; S3 raw/curated/aggregates | Batch retrieval/coverage transformation and bounded pagination |
| Trace Viewer: choose meal | ECS/Next.js server -> allow-listed Supabase RPC | ECS Task Definition secret bindings; Secrets Manager metadata | Direct point lookup; first external API; no Glue needed |
| System: Refresh | Next.js -> API Gateway `GET /cloud-monitoring` -> collector Lambda -> Google APIs; route histograms from DynamoDB | API Gateway; collector Lambda; DynamoDB; EventBridge five-minute rule | Second external API, live runtime health, persisted AI/non-AI latency split |
| System: Run snapshot | `POST /runs` -> Runs Lambda -> Extract Lambda -> Supabase -> S3 -> Glue -> EventBridge -> Loader Lambda -> DynamoDB | API Gateway, Lambda list/logs, newest S3 run, Glue Runs, EventBridge, DynamoDB | End-to-end client-triggered service automation |
| Automatic daily snapshot | EventBridge -> Extract Lambda -> same ETL path | EventBridge daily rule; CloudWatch/Lambda logs | Scheduled automation independent of a browser |
| Glue succeeds/fails | Glue state event -> filtered EventBridge rule -> Loader Lambda | Glue Runs; EventBridge success/failure rules | Only complete snapshots replace serving data; terminal failure recording |

## 4. AWS service-to-console cheat sheet

| Service/component | Stack and logical resource | AWS Console location | Key evidence to show |
| --- | --- | --- | --- |
| CloudFormation | `kallo-data`, `kallo-presentation` | CloudFormation -> Stacks -> Resources/Events/Template/Outputs | `CREATE_COMPLETE`/`UPDATE_COMPLETE`, declared resources, ALB output |
| Application Load Balancer | `kallo-presentation` -> `DashboardLoadBalancer`, `DashboardListener`, `DashboardTargetGroup` | EC2 -> Load Balancers / Target Groups | Internet-facing ALB, port 80 listener, healthy IP target, `/api/health` |
| ECS Fargate | `DashboardCluster`, `DashboardService`, `DashboardTaskDefinition` | ECS -> Clusters -> Service -> Tasks; Task definitions | Fargate, desired/running 1, 256 CPU, 512 MiB, container port 3000 |
| ECR | Image referenced by `DashboardTaskDefinition` | ECR -> Repositories | Versioned Linux/AMD64 dashboard image |
| API Gateway | `DashboardApi`, `ApiStage`, `DashboardUsagePlan` | API Gateway -> APIs -> Resources/Stages/Usage plans | `/metrics`, `/runs`, `/runs/{id}`, `/cloud-monitoring`; `prod`; throttle/quota |
| Lambda | Extract, Loader, Metrics, Runs, Monitoring collector, Authorizer | Lambda -> Functions; use CloudFormation physical-ID links | Purpose-specific functions, timeouts/memory, reserved concurrency, recent logs |
| S3 | `AnalyticsBucket` | S3 -> Buckets | `raw/`, run manifest, `curated/`, `aggregates/`; encryption and block-public-access |
| Glue | `AnalyticsGlueJob` | AWS Glue -> ETL jobs -> Runs/Details | Successful run, Glue 4.0, G.1X x2, timeout 10, concurrency 1, retries 0 |
| DynamoDB | `AnalyticsTable` | DynamoDB -> Tables -> Explore items / Exports and streams / Additional settings | `metric` + `date` keys, aggregates, route histograms, on-demand billing, TTL |
| EventBridge | Daily extract, Glue succeeded/failed, route ingestion | EventBridge -> Rules | Enabled schedules and exact Glue job-state filters/targets |
| Secrets Manager | Supabase, Google reader, dashboard bearer/session/login secrets | Secrets Manager -> Secrets | Separate secret resources and task/function bindings; never reveal values |
| CloudWatch | Lambda/ECS log groups and AWS service metrics | CloudWatch -> Log groups / Metrics | Recent invocations and container logs; absence of function errors where relevant |

## 5. Short answers for likely tutor questions

**Why does Refresh not run Glue?**  
Refresh re-fetches the selected page's existing source. System can obtain newer Google metrics and stored route histograms; Trace Viewer can obtain newer Supabase trace rows. Glue aggregates change only after the scheduled or founder-triggered full snapshot.

**Why are the two AI latency charts different?**  
Recorded AI pipeline latency uses persisted `pipeline_runs.total_ms`, exact daily percentiles, and only rows written by the application. Cloud Run AI endpoint latency uses complete request-log durations, bounded hourly histograms, and can include platform overhead and failed requests. They have different boundaries, populations, and freshness.

**Why use Glue instead of transforming a DTO in Lambda?**  
Glue consumes multiple manifested source views, applies repeatable multi-dataset transformations, writes curated Parquet and thirteen aggregate contracts, and provides a success/failure boundary before loading. A DTO mapper would only reshape one response.

**Why no Athena?**  
The dashboard always serves known precomputed aggregates from DynamoDB. Ad hoc SQL over S3 would add cost, permissions, latency, and explanation without improving the product. Curated Parquet remains available for future offline analysis.

**Why is Trace Viewer direct to Supabase?**  
It is a bounded lookup for one trace, not a large aggregate. Passing it through S3 and Glue would make it stale and unnecessarily complex. The RPC remains server-side and allow-listed.

**How is the application automated if CloudFormation is used?**  
CloudFormation automates provisioning. Runtime automation is separate: dashboard actions invoke API Gateway/Lambda or the Supabase RPC, while EventBridge schedules and Glue state events invoke downstream services without CLI or console actions.

**Why keep ALB/ECS temporary?**  
They prove the AWS-hosted client path but have an hourly baseline cost. CloudFormation recreates them for assessment sessions and deletes them afterward; the persistent data plane is mostly pay-per-use.

## 6. Recovery lines if live data is slow

- **Cold start:** “This request is crossing API Gateway and an idle Lambda; the first request can be slower, which is why I separate platform and application-recorded latency.”
- **Glue still running:** “The interface is polling the authoritative server-side phase. I will show the previous successful run while this one completes; the same success event invokes the loader.”
- **No new route point yet:** “Cloud Logging arrival plus the five-minute collector interval bounds freshness. The dashboard does not fabricate a zero while the bucket is absent.”
- **Google API temporarily fails:** “The panel exposes the source failure rather than substituting mock data; the rest of the dashboard remains usable because sources fail independently.”
- **Learner Lab session expires:** “The permanent link remains available for testing, while CloudFormation and the deployment scripts recreate the AWS evidence tier after credentials are renewed.”
