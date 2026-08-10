# Lab deployment scripts

Run these commands from the repository root with active AWS Academy credentials. Every script defaults to `us-east-1`; use another region only if you deliberately need to override that default. Never commit secret values or `.lab-config`.

## 1. Probe stack

Follow the probe-stack create, invoke, Glue, Athena, and delete commands in [infra/README.md](../infra/README.md). Complete this Session-0 check before creating persistent resources, and delete `kallo-probe` when the checks pass.

## 2. Data stack

Choose an existing S3 bucket for deployment scripts, then export the template's four `NoEcho` values:

```bash
export GLUE_SCRIPT_S3_URI='s3://YOUR-EXISTING-BUCKET/glue/job.py'
export SUPABASE_URL='https://YOUR-PROJECT.supabase.co'
export SUPABASE_KEY='YOUR-RESTRICTED-ANALYTICS-KEY'
export GEMINI_API_KEY='YOUR-GEMINI-KEY'
export DASHBOARD_BEARER_TOKEN='AT-LEAST-20-CHARACTERS'
scripts/deploy-data-stack.sh
```

The script uploads `glue/job.py` to `GLUE_SCRIPT_S3_URI`, uploads `glue/transforms.py` beside it, deploys `infra/data-stack.yaml`, and replaces all seven inline Lambda placeholders with the repository implementations.

## 3. First extract

Invoke the deployed extract once and inspect its response before relying on the daily schedule:

```bash
EXTRACT_FUNCTION_NAME="$(aws cloudformation describe-stacks \
  --stack-name kallo-data \
  --query 'Stacks[0].Outputs[?OutputKey==`ExtractFunctionName`].OutputValue | [0]' \
  --output text \
  --region us-east-1)"

aws lambda invoke \
  --function-name "$EXTRACT_FUNCTION_NAME" \
  --payload '{"mode":"on_demand"}' \
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
scripts/lab-up.sh
```

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
