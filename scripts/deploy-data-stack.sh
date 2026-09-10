#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
STACK_NAME="kallo-data"
GLUE_SCRIPT_S3_URI="${GLUE_SCRIPT_S3_URI:-}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-data-stack.sh [options]

Upload Glue sources, deploy the persistent data stack, then publish every Lambda ZIP.

Required environment variables (the template's NoEcho parameters):
  SUPABASE_URL
  SUPABASE_KEY
  SUPABASE_API_KEY
  GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_FILE
  GOOGLE_CLOUD_PROJECT_ID
  GOOGLE_CLOUD_RUN_SERVICE
  GOOGLE_CLOUD_RUN_LOCATION
  DASHBOARD_BEARER_TOKEN

GlueScriptS3Uri must be supplied with GLUE_SCRIPT_S3_URI or --glue-script-s3-uri.
The bucket must already exist. transforms.py is uploaded beside the entrypoint object.

Options:
  --stack-name NAME           Data stack name (default: kallo-data)
  --glue-script-s3-uri URI    Destination for glue/job.py
  --region REGION             AWS region (default: us-east-1)
  -h, --help                  Show this help
EOF
}

while (($#)); do
  case "$1" in
    --stack-name) STACK_NAME="${2:?--stack-name requires a value}"; shift 2 ;;
    --glue-script-s3-uri) GLUE_SCRIPT_S3_URI="${2:?--glue-script-s3-uri requires a value}"; shift 2 ;;
    --region) REGION="${2:?--region requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

missing=()
for name in SUPABASE_URL SUPABASE_KEY SUPABASE_API_KEY GOOGLE_CLOUD_PROJECT_ID GOOGLE_CLOUD_RUN_SERVICE GOOGLE_CLOUD_RUN_LOCATION DASHBOARD_BEARER_TOKEN; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done
if [[ -z "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  if [[ -z "${GOOGLE_SERVICE_ACCOUNT_JSON_FILE:-}" ]]; then
    missing+=("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_FILE")
  elif [[ ! -r "$GOOGLE_SERVICE_ACCOUNT_JSON_FILE" ]]; then
    echo "Error: GOOGLE_SERVICE_ACCOUNT_JSON_FILE is not readable: $GOOGLE_SERVICE_ACCOUNT_JSON_FILE" >&2
    exit 1
  else
    GOOGLE_SERVICE_ACCOUNT_JSON="$(<"$GOOGLE_SERVICE_ACCOUNT_JSON_FILE")"
  fi
fi
if ((${#missing[@]})); then
  printf 'Error: required NoEcho environment variable(s) unset: %s\n' "${missing[*]}" >&2
  exit 1
fi
if [[ ! "$GLUE_SCRIPT_S3_URI" =~ ^s3://[^/]+/.+[^/]$ ]]; then
  echo "Error: GLUE_SCRIPT_S3_URI must be an object URI such as s3://bucket/glue/job.py" >&2
  exit 1
fi

GLUE_SCRIPT_DIRECTORY="${GLUE_SCRIPT_S3_URI%/*}"
aws s3 cp glue/job.py "$GLUE_SCRIPT_S3_URI" --region "$REGION"
aws s3 cp glue/transforms.py "${GLUE_SCRIPT_DIRECTORY}/transforms.py" --region "$REGION"

aws cloudformation deploy \
  --template-file infra/data-stack.yaml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    GlueScriptS3Uri="$GLUE_SCRIPT_S3_URI" \
    GlueTransformsS3Uri="${GLUE_SCRIPT_DIRECTORY}/transforms.py" \
    SupabaseUrl="$SUPABASE_URL" \
    SupabaseKey="$SUPABASE_KEY" \
    SupabaseApiKey="$SUPABASE_API_KEY" \
    GoogleServiceAccountJson="$GOOGLE_SERVICE_ACCOUNT_JSON" \
    GoogleCloudProjectId="$GOOGLE_CLOUD_PROJECT_ID" \
    GoogleCloudRunService="$GOOGLE_CLOUD_RUN_SERVICE" \
    GoogleCloudRunLocation="$GOOGLE_CLOUD_RUN_LOCATION" \
    DashboardBearerToken="$DASHBOARD_BEARER_TOKEN" \
  --no-fail-on-empty-changeset \
  --region "$REGION"

STACK_STATUS="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --query 'Stacks[0].StackStatus' \
  --output text --region "$REGION")"
case "$STACK_STATUS" in
  CREATE_COMPLETE) WAIT_TARGET="stack-create-complete" ;;
  UPDATE_COMPLETE) WAIT_TARGET="stack-update-complete" ;;
  *) echo "Error: stack $STACK_NAME is in unexpected state $STACK_STATUS" >&2; exit 1 ;;
esac
aws cloudformation wait "$WAIT_TARGET" --stack-name "$STACK_NAME" --region "$REGION"

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kallo-lambda-zips.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT

stack_output() {
  local output_key="$1"
  local value
  value="$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey==\`${output_key}\`].OutputValue | [0]" \
    --output text --region "$REGION")"
  if [[ -z "$value" || "$value" == "None" ]]; then
    echo "Error: stack $STACK_NAME has no $output_key output" >&2
    exit 1
  fi
  printf '%s\n' "$value"
}

package_and_update() {
  local output_key="$1"
  local entrypoint="$2"
  shift 2
  local package_dir="$BUILD_DIR/${output_key}"
  local zip_path="$BUILD_DIR/${output_key}.zip"
  local function_name

  mkdir -p "$package_dir"
  cp "$entrypoint" "$package_dir/index.py"
  while (($#)); do
    cp "$1" "$package_dir/"
    shift
  done
  (cd "$package_dir" && zip -q "$zip_path" ./*.py)

  function_name="$(stack_output "$output_key")"
  aws lambda update-function-code \
    --function-name "$function_name" \
    --zip-file "fileb://${zip_path}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$function_name" --region "$REGION"
  printf 'Updated Lambda: %s\n' "$function_name"
}

package_with_requirements_and_update() {
  local output_key="$1"
  local entrypoint="$2"
  local requirements="$3"
  shift 3
  local package_dir="$BUILD_DIR/${output_key}"
  local zip_path="$BUILD_DIR/${output_key}.zip"
  local function_name

  mkdir -p "$package_dir"
  cp "$entrypoint" "$package_dir/index.py"
  while (($#)); do
    cp "$1" "$package_dir/"
    shift
  done
  python3 -m pip install --quiet --disable-pip-version-check \
    --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 \
    --only-binary=:all: --target "$package_dir" -r "$requirements"
  (cd "$package_dir" && zip -qr "$zip_path" .)

  function_name="$(stack_output "$output_key")"
  aws lambda update-function-code \
    --function-name "$function_name" \
    --zip-file "fileb://${zip_path}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$function_name" --region "$REGION"
  printf 'Updated Lambda: %s\n' "$function_name"
}

package_and_update ExtractFunctionName lambdas/extract/handler.py lambdas/extract/extract_core.py
package_and_update LoaderFunctionName lambdas/loader/handler.py lambdas/loader/loader_core.py
package_and_update ApiMetricsFunctionName lambdas/api/metrics.py lambdas/api/api_core.py
package_and_update ApiRunsFunctionName lambdas/api/runs.py lambdas/api/api_core.py
package_with_requirements_and_update ApiCloudMonitoringFunctionName \
  lambdas/api/cloud_monitoring.py lambdas/api/requirements-cloud-monitoring.txt \
  lambdas/api/api_core.py lambdas/api/cloud_logging.py
package_and_update AuthorizerFunctionName lambdas/authorizer/handler.py

echo "Data stack deployed and application code updated: $STACK_NAME"
