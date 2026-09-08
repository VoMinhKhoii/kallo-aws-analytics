# Lab deployment scripts

Run these commands from the repository root with active AWS Academy credentials. Every script defaults to `us-east-1`; use another region only if you deliberately need to override that default. Never commit secret values or `.lab-config`.

## 1. Legacy probe stack

The probe stack is retained as historical Learner Lab capability evidence. It is not part of the current application architecture; see [infra/README.md](../infra/README.md).

## 2. Data stack

Choose an existing S3 bucket for deployment scripts, then export the template's `NoEcho` values and Cloud Run identity:

```bash
export GLUE_SCRIPT_S3_URI='s3://YOUR-EXISTING-BUCKET/glue/job.py'
export SUPABASE_URL='https://YOUR-PROJECT.supabase.co'
export SUPABASE_KEY='YOUR-RESTRICTED-ANALYTICS-KEY'
export SUPABASE_API_KEY='YOUR-PUBLISHABLE-OR-LEGACY-ANON-KEY'
export GOOGLE_SERVICE_ACCOUNT_JSON_FILE='/ABSOLUTE/PATH/gcp-monitoring-reader.json'
export GOOGLE_CLOUD_PROJECT_ID='YOUR-GCP-PROJECT'
export GOOGLE_CLOUD_RUN_SERVICE='YOUR-CLOUD-RUN-SERVICE'
export GOOGLE_CLOUD_RUN_LOCATION='YOUR-CLOUD-RUN-REGION'
export DASHBOARD_BEARER_TOKEN='AT-LEAST-20-CHARACTERS'
scripts/deploy-data-stack.sh
```

The Google service account should have only `roles/monitoring.viewer`; keep its JSON key outside the repository with owner-only permissions. The script also accepts the JSON value through `GOOGLE_SERVICE_ACCOUNT_JSON`.

The script uploads `glue/job.py` to `GLUE_SCRIPT_S3_URI`, uploads `glue/transforms.py` beside it, deploys `infra/data-stack.yaml`, and replaces all six active inline Lambda placeholders with the repository implementations.

## 3. First extract

Invoke the deployed extract once and inspect its response before relying on the daily schedule:

```bash
EXTRACT_FUNCTION_NAME="$(aws cloudformation describe-stacks \
  --stack-name kallo-data \
  --query 'Stacks[0].Outputs[?OutputKey==`ExtractFunctionName`].OutputValue | [0]' \
  --output text \
  --region us-east-1)"
RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

aws lambda invoke \
  --function-name "$EXTRACT_FUNCTION_NAME" \
  --payload "$(jq -cn --arg run_id "$RUN_ID" '{mode:"on_demand",run_id:$run_id}')" \
  --cli-binary-format raw-in-base64-out \
  --region us-east-1 \
  /tmp/kallo-first-extract.json

cat /tmp/kallo-first-extract.json
```

Check the Lambda logs, the raw manifest in S3, and the resulting Glue run before continuing.

## 4. Push the dashboard image

```bash
scripts/push-image.sh --tag first-demo
```

This builds for `linux/amd64`, creates `kallo-dashboard` in ECR if needed, pushes the tag, prints its URI, and records `IMAGE_URI` in the ignored `.lab-config` file.

## 5. Start and stop the presentation lab

Create the session-only presentation tier using the saved image URI:

```bash
export DASHBOARD_FOUNDER_USERNAME='YOUR-FOUNDER-USERNAME'
export DASHBOARD_FOUNDER_PASSWORD='AT-LEAST-12-CHARACTERS'
export DASHBOARD_REVIEWER_USERNAME='YOUR-REVIEWER-USERNAME'
export DASHBOARD_REVIEWER_PASSWORD='AT-LEAST-12-CHARACTERS'
export DASHBOARD_SESSION_SECRET='AT-LEAST-32-CHARACTERS'
scripts/lab-up.sh
```

The five login values are passed as CloudFormation `NoEcho` parameters and
stored in Secrets Manager resources owned by the disposable presentation
stack. ECS reads them through `LabRole`; `scripts/lab-down.sh` deletes those
secrets with the ALB and service. The HTTP-only classroom ALB explicitly uses
non-`Secure` session cookies, while production hosts keep the secure default.
The script also resolves the existing data stack's `SupabaseCreds` resource so
the server-side product and ingredient panels use its restricted analytics JWT
and publishable API key; it never reads or prints those values.

You can instead pass an image explicitly, and can point at a differently named data stack:

```bash
scripts/lab-up.sh ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/kallo-dashboard:TAG \
  --data-stack-name kallo-data
```

At the end of every work session, delete the presentation tier and review the printed billing checklist:

```bash
scripts/lab-down.sh
```

The persistent data stack and ECR images are intentionally not deleted by `lab-down.sh`. Check the Vocareum Learner Lab budget before each session; the account has a hard $50 total budget.

## Local end-to-end

The local stack runs the production extractor, transforms, loader, and API
handlers against the DEV Supabase project without contacting AWS. Export only
the restricted analytics credentials described in
[supabase/README.md](../supabase/README.md); never use the JWT signing secret or
the service-role key.

```bash
export SUPABASE_URL='https://jqgmcnlfxzzhrvrzpoye.supabase.co'
export ANALYTICS_READER_JWT='YOUR-MINTED-ANALYTICS-READER-JWT'
export SUPABASE_API_KEY='YOUR-PUBLISHABLE-OR-LEGACY-ANON-KEY'
export DASHBOARD_TOKEN='AT-LEAST-20-CHARACTERS'

python3 scripts/local_stack.py --reset --once
python3 scripts/local_stack.py --serve --port 8000
```

Local objects and the JSON-backed table default to `.local/s3`. Use `--root`
to choose another disposable directory. Point the dashboard at the server with
`MOCK_API=0`, `API_BASE_URL=http://127.0.0.1:8000`, and the same
`DASHBOARD_TOKEN`. The Cloud Monitoring endpoint returns HTTP 501 because its
cross-cloud IAM and caching path is verified through the deployed collector;
real Parquet, IAM, EventBridge, and the ECS/ALB path can only be verified on AWS.
