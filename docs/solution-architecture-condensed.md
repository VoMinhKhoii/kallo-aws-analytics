# Kallo Analytics Plane - Condensed Solution Architecture

Assessment 3 - AWS Cloud System Development  
Student: [name and student number]  
Document status: Condensed foundation for final submission

This report is written so that a reader can understand the product before seeing its cloud implementation. It first explains the operational problem and dashboard experience, then follows each client action through AWS and the two external APIs. Detailed deployment commands and the ten-minute demonstration sequence are maintained separately from the assessed report.

## 1. Submission links

**Live AWS application.** [Insert the Application Load Balancer URL used during the assessed demonstration.]

**Permanent testing link.** [Insert the stable testing URL.] This link is a continuity workaround for short-lived AWS Academy Learner Lab sessions. It is not part of the assessed architecture or evidence for an AWS service.

**Source repository.** [Insert the accessible repository URL. Credentials and private production data are excluded.]

**Public datasets.** Kallo uses food-composition records derived from authoritative sources such as the United States Department of Agriculture (USDA) and the Food and Agriculture Organization (FAO). [Insert the final dataset URLs or state why production data is not redistributed.]

**Architecture assets.** The editable diagram is stored at `docs/doc_images/kallo-analytics-architecture.drawio`; the exported image is in the same folder.

## 2. From meal data to an operator view

### 2.1 Project summary

Kallo is a text-first nutrition tracker. A person types a meal in natural language, and the product turns it into structured ingredients and nutrition data through an AI-assisted retrieval pipeline. Kallo Analytics Plane is a private dashboard built around that production system. Its purpose is to help an operator understand product activity, AI behaviour, ingredient coverage, exact meal-analysis traces, and Cloud Run health without exposing unrestricted production data.

The assessed client is a Next.js container on Amazon Elastic Container Service (ECS) with AWS Fargate, reached through an Application Load Balancer (ALB). Authenticated server routes call Amazon API Gateway and narrowly scoped AWS Lambda functions. Product analytics are materialised through Amazon S3, AWS Glue, and Amazon DynamoDB, while current system telemetry comes from Google Cloud Monitoring and Cloud Logging. Supabase provides restricted product views and bounded trace functions.

### 2.2 Motivation and beneficiaries

Kallo's main application was already functional, but its operational evidence was spread across database queries, AI logs, and cloud-provider consoles. An uptime check could not show whether normal endpoints or AI meal analysis were slow. It also could not explain a rise in token cost, an ingredient coverage gap, or the stages of one failed meal request. The dashboard brings these questions into one consistent interface and turns raw technical signals into charts, tables, and compact trace views.

The founder uses the dashboard to monitor reliability, adoption, and model cost. Product engineers can separate HTTP latency, recorded pipeline latency, model failures, and container startup. Food-data maintainers can inspect frequent ingredient demand, accepted candidates, gaps, and suspicious nutrition records. The architecture also gives an assessor a complete path from a client action to automated AWS processing and an interpretable result.

### 2.3 What the operator sees

The **Today** page gives a short operational summary from the latest completed product snapshot. The **AI** page shows AI call volume, recorded pipeline latency, failures, token use, and estimated cost over 24-hour, 7-day, or 30-day windows. **Ingredients** combines retrieval demand, mappings, catalogue coverage, rejected or unmatched queries, and rank behaviour. **System** presents Cloud Run traffic, 5xx responses, route-separated latency, startup time, CPU, memory, and instance count. **Trace Viewer** lists bounded original meal descriptions and opens each request on a separate page with ordered stage outputs.

This sequence is intentionally simple: Today answers "Is anything unusual?", the domain pages answer "Where is it happening?", and Trace Viewer answers "What happened in this request?" A shared time-window control keeps comparisons consistent. Line charts use the full content width, while tables paginate dense ingredient and trace data.

## 3. Related work and design position

Cloud-provider consoles, Grafana-style observability tools, and general business-intelligence dashboards solve parts of the same problem. Google Cloud already exposes strong infrastructure time series, while Supabase exposes PostgreSQL data through its Data API. These tools remain useful for engineering diagnosis, but they do not understand Kallo's meal pipeline, ingredient matching decisions, or privacy boundary.

Kallo Analytics Plane therefore acts as a domain-specific operations layer rather than a replacement for every cloud console. Provider-native metrics remain the source for Cloud Run health. AWS provides the automated extraction, transformation, serving, and presentation path required by the assignment. Exact traces stay close to Supabase because copying every raw trace into AWS would increase privacy risk and make request-level diagnosis stale.

The scope deliberately excludes Amazon Athena and an additional Gemini summary feature. Athena would query curated files, but the dashboard already reads bounded aggregates from DynamoDB and does not need ad hoc SQL. A generated weekly summary would add another AI call without improving the core monitoring questions. Gemini model names, token counts, failures, latency, and estimated cost remain observed product data, not a separate report-generation API.

## 4. Architecture and automated client operations

[[ARCHITECTURE_FIGURE]]

*Figure 1. Kallo Analytics Plane assessed runtime architecture.*

### 4.1 Authenticated client path

During an assessment session, the operator opens the ALB URL. The ALB health-checks and forwards traffic to the Next.js task on ECS/Fargate. Login creates an HMAC-signed, HttpOnly, SameSite=Strict session with founder or reviewer permissions. When a page needs AWS data, a same-origin Next.js server route adds a server-held bearer token and calls API Gateway. A Lambda TOKEN authorizer validates the request before API Gateway applies routing, throttling, and quota controls.

This server facade keeps AWS and external-service credentials out of browser JavaScript. It also gives the user one consistent application even though the underlying panels use different freshness models. Read-only reviewers can inspect data, while founder-only routes can start a batch snapshot.

### 4.2 Product analytics: Supabase to S3, Glue, and DynamoDB

Amazon EventBridge invokes the extract Lambda approximately once every 24 hours, or a founder starts the same operation through `POST /runs`. The function reads six sanitised Supabase views through HTTPS/PostgREST and writes JSON Lines plus a manifest to a run-specific S3 prefix. It then starts one Glue job with the manifest location. Glue reads only that generation, performs deterministic PySpark transformations, writes curated Parquet, and materialises thirteen bounded aggregate JSON contracts.

An EventBridge rule reacts only when the named Glue job succeeds. The loader Lambda then validates the generation and replaces the corresponding DynamoDB metric/date snapshots idempotently. Failed Glue jobs update run state but never publish partial aggregates. API Gateway later invokes the metrics Lambda, which accepts only allow-listed metric names and filters the newest complete snapshot to the chosen display window.

Glue is more than a Data Transfer Object (DTO) mapper in this path. A DTO could rename one response, but it would not join several source views, preserve immutable run manifests, produce reusable Parquet, or enforce a success-only publication boundary. Glue would be excessive for one small display-ready response; it is appropriate here because the report needs a repeatable multi-source analytics job. S3 provides the durable raw and curated boundary, while DynamoDB gives the dashboard predictable reads.

### 4.3 System telemetry: Google APIs to bounded AWS storage

The System page calls `/cloud-monitoring` through the same Next.js, API Gateway, and Lambda path. On a cache miss or explicit refresh, the observability Lambda uses a read-only Google service account from Secrets Manager to query Cloud Monitoring. It requests Cloud Run request count, 5xx count, request latency, container startup latency, CPU, memory, and instance count with explicit intervals, aligners, and reducers. Responses are cached for 120 seconds to limit external calls.

Cloud Run's built-in route label is empty for this service, so it cannot separate the meal-analysis endpoint from ordinary application traffic. EventBridge therefore invokes a bounded Cloud Logging collector every five minutes. The collector reads retained request-log entries, classifies exact `POST /api/analyze-meal` requests as AI and other valid application paths as normal, then replaces hourly histogram summaries in DynamoDB. AWS stores only counts, latency bounds, sums, bucket counts, ingestion time, and expiry. It does not copy URLs, request bodies, users, sessions, or raw log entries.

The System response merges provider-native Monitoring series with these route histograms. A one-time bounded backfill populated retained history, and subsequent collection overlaps recent hours so late logs are included. A 32-day Time to Live (TTL) safely covers the 30-day dashboard window.

### 4.4 Exact meal diagnosis through a restricted RPC

Trace Viewer does not use the batch pipeline. It calls the allow-listed Supabase function `analytics_requests_page` to list bounded requests for the selected window. Selecting a meal opens `/trace/{requestId}`, where the server calls `analytics_trace_detail` and renders ordered stages, timings, and compact structured outputs. The table displays what the person typed, not an aggregation of extracted meal items.

This direct path is intentional. Request-level diagnosis needs current detail, while S3 and Glue produce delayed aggregates. The browser never receives the Supabase credential, user or session identifiers, request context, prompts, images, wire responses, or unrestricted rows.

## 5. Purpose of the cloud components

The presentation and control layer contains **ALB**, **ECS/Fargate**, **ECR**, **API Gateway**, and **Lambda**. ALB is the assessed HTTP ingress and target-health boundary. ECS/Fargate runs the Linux container without a user-managed EC2 server, and ECR stores its versioned image. API Gateway provides the authenticated REST boundary with throttling, quota, CORS, and Lambda proxy integration. Lambda separates extraction, loading, metric reads, run control, Google telemetry collection, and authorization into small event-driven handlers.

The data layer contains **S3**, **Glue**, and **DynamoDB**. S3 stores raw JSONL, manifests, curated Parquet, aggregate JSON, and Glue code. Glue implements the repeatable analytics transformation. DynamoDB serves thirteen aggregate contracts, manual run state and guard records, short Monitoring caches, and hourly route histograms. On-demand capacity and TTL reduce operational work for a low-traffic assessment system.

The automation and operations layer contains **EventBridge**, **Secrets Manager**, and **CloudWatch**. EventBridge schedules the daily snapshot and five-minute log ingestion, and it routes Glue success or failure events. Secrets Manager stores Supabase credentials, the Google service-account JSON, the API bearer token, and dashboard login secrets outside code and container images. CloudWatch records Lambda and ECS logs and native AWS metrics. AWS Academy requires the shared `LabRole`; in a normal account, each Lambda would receive a separate least-privilege role.

## 6. Data structures and API usage

### 6.1 Data contracts

The six Supabase analytics views cover meal activity, AI calls, ingredient decisions, food composition, application-health events, and related transformation inputs. They are privacy-reduced at the database boundary. Aggregate output contains no raw person, session, request, meal, or telemetry-event identifier. A keyed user hash exists only inside Glue for distinct daily and weekly activity counts and is never emitted.

S3 paths are run-specific: `raw/<source>/dt=<date>/run=<id>/`, `raw/_manifests/`, `curated/<dataset>/`, and `aggregates/<metric>.json`. This structure prevents files from different generations from being mixed. The manifest, rather than a "latest file" lookup, is the hand-off contract between extraction, Glue, and loading.

DynamoDB uses `metric` as the partition key and an observation date or UTC hour as the sort key. Aggregate items hold one of thirteen bounded payloads, including activity, AI latency, model failures, token cost, ingredient demand, mappings, gaps, rank distribution, and implausible foods. Separate keys store run state, a 30-minute global run guard, the short Cloud Monitoring cache, and route histograms. This design lets the dashboard query small known keys instead of scanning raw production data.

### 6.2 AWS and external API contracts

API Gateway exposes four assessed contracts: `GET /metrics/{metric}` returns one allow-listed aggregate; `POST /runs` starts a founder-only snapshot or returns the shared guard boundary; `GET /runs/{run_id}` reports extract, Glue, and load state; and `GET /cloud-monitoring` returns cached or refreshed Monitoring series merged with stored route histograms. The exact trace RPC remains behind a same-origin Next.js route because it is already restricted at the database function and server layer. Adding another proxy would add latency without improving the aggregate API boundary.

The first external integration is **Supabase PostgREST/RPC**. PostgREST supplies sanitised views to the extractor, while two migration-controlled database functions provide bounded trace list and detail results. The second integration is **Google Cloud Monitoring and Logging APIs**. The Monitoring API supplies provider-generated time series; the Logging API supplies retained request entries needed for route classification. Both integrations are called automatically by deployed code, which satisfies the assignment definition of an implemented API rather than a manual console export.

The Google reader holds only `roles/monitoring.viewer` and `roles/logging.viewer` in the target project. Billing export is not used. AI operating cost is estimated from recorded input and output tokens multiplied by configured per-model rates. Unknown pricing is marked as unknown rather than treated as free, and the result is never labelled as an invoice.

## 7. Metric meaning, freshness, and interpretation

Three latency measures must remain separate. **Normal API latency** is the complete Cloud Run duration for valid application requests other than the exact meal-analysis endpoint. **Cloud Run AI endpoint latency** is the complete HTTP duration for `POST /api/analyze-meal`, including platform and framework overhead, retrieval, model work, response assembly, and logged failures. **Recorded AI pipeline latency** comes from application-written `pipeline_runs.total_ms`, grouped by UTC day and terminal model, then materialised through Glue. The endpoint and pipeline charts do not use the same population or boundary, so they should be compared only after selecting the same time window.

Very low AI endpoint points can represent requests rejected early with statuses such as 400, 401, or 429. A fast failure is still a real HTTP request but does not mean the meal pipeline completed quickly. The chart should therefore be interpreted with traffic and response-code data; a future refinement can show successful and failed endpoint latency as separate series. A latency spike may coincide with container startup when minimum instances are zero, but correlation with the startup chart does not prove causation.

Route percentiles use mergeable histograms. Each hourly route summary counts observations in fixed millisecond ranges that double from 1 ms to 128 seconds. To estimate p95 or p99, the collector finds the bucket containing the target rank and interpolates between that bucket's bounds, then clamps the result to the observed minimum and maximum. The exact request value is not retained, so the percentile is an estimate. At low traffic, p95 and p99 often occupy the same top bucket and can overlap. At higher traffic, the estimate becomes statistically steadier, although bucket width still limits precision.

Freshness follows the source, not the login session. **Run snapshot** creates new product aggregates through Supabase, S3, Glue, the loader, and DynamoDB. Clicking Refresh on Today, AI, or Ingredients only re-reads the newest completed snapshot; it cannot create new source data. **System Refresh** bypasses the 120-second cache and queries current Google Monitoring series while re-reading route histograms collected on the five-minute schedule. **Trace Refresh** runs the restricted RPC again. Logging out removes the browser session but does not clear DynamoDB, Google telemetry, Supabase data, or either EventBridge schedule.

Google alignment is chosen to match the display window. Up to seven days uses one-hour alignment, while 30 days uses six-hour alignment. Counts are summed. Instance count uses mean alignment before cross-series summation because Cloud Run emits active, idle, and revision series separately; summing independent maxima could invent a peak that never occurred at one time.

## 8. Security, reliability, and cost decisions

Security is enforced through several narrow boundaries. Browser traffic is same-origin, API secrets remain server-side, and founder or reviewer sessions are signed and HttpOnly. Mutating routes require founder permission and a matching origin. Supabase views and RPCs are allow-listed, Google roles are read-only, S3 blocks public access, and secrets remain in Secrets Manager. No raw log body, prompt, image, actor identifier, or unrestricted trace is stored in DynamoDB or rendered in the dashboard.

Reliability comes from immutable manifests, success-only loading, conditional DynamoDB writes, and idempotent replacements. The global run guard stops duplicate manual batches across browsers and devices. Recent log hours are deliberately re-read and replaced to capture late entries. The UI distinguishes loading, empty, unavailable, and stale states rather than showing a misleading zero.

Cost controls fit the temporary Learner Lab environment. Lambda reserved concurrency totals eight of the ten available lanes. API Gateway is capped at 2 requests per second with a burst of 5 and a monthly quota. Glue uses two G.1X workers, a ten-minute timeout, one concurrent job, and no automatic retry. DynamoDB uses on-demand capacity, Monitoring responses are cached for 120 seconds, and route summaries expire automatically. The ALB/Fargate presentation tier is created for assessment sessions and removed afterward; a stable external testing mirror provides continuity without being claimed as AWS deployment evidence.

## 9. Validation, limitations, and future direction

The project is defined through CloudFormation as a persistent data stack and a disposable presentation stack. Deployment scripts package Lambda code, upload Glue sources, update the stacks, build and push the dashboard image, and start or stop ECS/ALB. Automated checks cover Python tests, TypeScript, the production Next.js build, CloudFormation linting, shell syntax, and diagram validation. Demonstration evidence should pair each visible dashboard action with the corresponding AWS console page and CloudWatch log, while credentials and account identifiers remain redacted.

The current design is appropriate for assessment traffic, not unlimited growth. Polling retained log entries will become inefficient at high request volume. A larger production system should emit route-labelled OpenTelemetry histograms or use streaming aggregation, while retaining sampled exact traces for diagnosis. Histogram boundaries should be versioned before they are narrowed because summaries with different bucket definitions cannot be merged safely. Longer-term telemetry can be stored at a coarser resolution if a future capacity-planning requirement justifies it.

## 10. Conclusion

Kallo Analytics Plane uses AWS as an automated analytics and serving system rather than a collection of console-created resources. Lambda and API Gateway form the control plane, S3 and Glue create a repeatable batch boundary, DynamoDB serves bounded results, EventBridge keeps both analytics and telemetry moving, and ECS/Fargate with ALB provides the assessed client deployment. Supabase supplies restricted product data and exact traces, while Google APIs supply provider-native health and retained request evidence.

Separating batch aggregates, current system telemetry, and exact diagnosis makes the system easier to explain and safer to operate. Each dashboard page has a clear question, each refresh action has a precise meaning, and each cloud component has a reason to exist. This structure also lets the assessor understand the product before following the detailed service interactions.

## References

[1] Amazon Web Services, “AWS Lambda concepts,” *AWS Lambda Developer Guide*.

[2] Amazon Web Services, “What is Amazon API Gateway?,” *Amazon API Gateway Developer Guide*.

[3] Amazon Web Services, “AWS Glue: How it works,” *AWS Glue Developer Guide*.

[4] Amazon Web Services, “What is Amazon DynamoDB?,” *Amazon DynamoDB Developer Guide*.

[5] Amazon Web Services, “What is Amazon Elastic Container Service?,” *Amazon ECS Developer Guide*.

[6] Google Cloud, “Filtering and aggregation: manipulating time series,” *Cloud Monitoring Documentation*.

[7] Google Cloud, “Cloud Run metrics,” *Cloud Run Documentation*.

[8] Google Cloud, “Method: entries.list,” *Cloud Logging API v2*.

[9] Supabase, “Database Functions,” *Supabase Documentation*.

[10] PostgreSQL Global Development Group, “CREATE FUNCTION,” *PostgreSQL Documentation*.
