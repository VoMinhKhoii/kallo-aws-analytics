# Infrastructure deployment

All commands assume active AWS Academy Learner Lab credentials and `us-east-1`. The templates create no IAM resources; AWS workloads use the pre-existing `LabRole`.

## Current architecture

The persistent `data-stack.yaml` contains:

- scheduled/manual Supabase extraction with Lambda;
- private S3 raw, curated, and aggregate objects;
- one bounded AWS Glue ETL job;
- EventBridge success routing to a loader Lambda;
- DynamoDB aggregate storage and a two-minute Cloud Monitoring cache;
- API Gateway routes for metrics, runs, and Google Cloud Monitoring;
- a TOKEN authorizer and Secrets Manager values.

Athena and the generated Gemini weekly-summary path are not part of the current application. Learner Lab explicitly denied deletion of the old Athena Lambda, so it remains at reserved concurrency zero with no route or invoke permission; this inert compatibility resource is not an Athena implementation claim. The existing Insight Lambda was updated in place into the Cloud Monitoring collector because the same policy denied creating a replacement Lambda. The separate `probe-stack.yaml` still records the earlier Session-0 capability check, including Athena, but it is not an application dependency or a service claim for the final solution.

The disposable `presentation-stack.yaml` contains the ALB, ECS Fargate service, ECR image reference, and private-console login secrets. Vercel remains the permanent submission URL; the presentation stack is created only when AWS-hosted evidence is needed.

## Persistent data stack

Prefer the deployment script because it uploads Glue sources and packages every Lambda implementation after CloudFormation creates the resources.

```bash
export GLUE_SCRIPT_S3_URI='s3://YOUR-EXISTING-BUCKET/glue/job.py'
export SUPABASE_URL='https://YOUR-PROJECT.supabase.co'
export SUPABASE_KEY='YOUR-RESTRICTED-ANALYTICS-JWT'
export SUPABASE_API_KEY='YOUR-PUBLISHABLE-OR-LEGACY-ANON-KEY'
export GOOGLE_SERVICE_ACCOUNT_JSON_FILE="$HOME/.config/kallo-aws-analytics/gcp-monitoring-reader.json"
export GOOGLE_CLOUD_PROJECT_ID='YOUR-GCP-PROJECT'
export GOOGLE_CLOUD_RUN_SERVICE='YOUR-CLOUD-RUN-SERVICE'
export GOOGLE_CLOUD_RUN_LOCATION='YOUR-CLOUD-RUN-REGION'
export DASHBOARD_BEARER_TOKEN='AT-LEAST-20-CHARACTERS'

scripts/deploy-data-stack.sh
```

`GOOGLE_SERVICE_ACCOUNT_JSON` may be supplied directly instead of the file variable. The account needs only the Google Cloud `Monitoring Viewer` role and the Lambda credential uses the `monitoring.read` OAuth scope. Keep the JSON key outside this repository with owner-only file permissions.

Cloud Run's built-in request metric does not populate its `route` label. Create
the two low-cardinality distribution metrics once so the System page can split
the complete AI meal request from normal API traffic:

```bash
gcloud logging metrics create kallo_ai_request_latency \
  --project=YOUR-GCP-PROJECT \
  --config-from-file=infra/gcp/kallo-ai-request-latency.yaml
gcloud logging metrics create kallo_normal_request_latency \
  --project=YOUR-GCP-PROJECT \
  --config-from-file=infra/gcp/kallo-normal-request-latency.yaml
```

The filters use automatic Cloud Run request logs and extract
`httpRequest.latency` into distributions. They add no application middleware
and require no extra permission for the read-only Monitoring service account.
They begin collecting only new requests after creation; Google does not
backfill older logs into a new logs-based metric.

## Disposable presentation stack

Build and push a Linux/AMD64 dashboard image, then start the AWS presentation tier:

```bash
scripts/push-image.sh --tag assessment

export DASHBOARD_FOUNDER_USERNAME='YOUR-FOUNDER-USERNAME'
export DASHBOARD_FOUNDER_PASSWORD='AT-LEAST-12-CHARACTERS'
export DASHBOARD_REVIEWER_USERNAME='YOUR-REVIEWER-USERNAME'
export DASHBOARD_REVIEWER_PASSWORD='AT-LEAST-12-CHARACTERS'
export DASHBOARD_SESSION_SECRET='AT-LEAST-32-CHARACTERS'

scripts/lab-up.sh
```

At the end of the session:

```bash
scripts/lab-down.sh
```

Always remove `kallo-presentation` before removing `kallo-data`, because the presentation stack imports data-stack exports. The ALB and Fargate task have an hourly runtime cost; the persistent stack is primarily pay-per-request, with Glue as the main burst cost.

## Legacy Session-0 probe

`scripts/session-zero-probe.sh` and `infra/probe-stack.yaml` are retained as historical evidence that the Learner Lab allowed Lambda, Glue, Athena, ECS, and ALB. They are not required to redeploy the current application. Do not recreate that probe unless fresh capability evidence is specifically required, and delete it immediately after the check.
