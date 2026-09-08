#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
STACK_NAME="kallo-presentation"
DATA_STACK_NAME="kallo-data"
IMAGE_URI=""
CONFIG_FILE=".lab-config"

usage() {
  cat <<'EOF'
Usage: scripts/lab-up.sh [IMAGE_URI] [options]

Deploy the disposable presentation stack in the default VPC and print its URL.

Options:
  --image-uri URI          ECR image URI (otherwise read IMAGE_URI from .lab-config)
  --stack-name NAME        Presentation stack name (default: kallo-presentation)
  --data-stack-name NAME   Data stack whose exports are imported (default: kallo-data)
  --region REGION          AWS region (default: us-east-1)
  -h, --help               Show this help
EOF
}

while (($#)); do
  case "$1" in
    --image-uri) IMAGE_URI="${2:?--image-uri requires a value}"; shift 2 ;;
    --stack-name) STACK_NAME="${2:?--stack-name requires a value}"; shift 2 ;;
    --data-stack-name) DATA_STACK_NAME="${2:?--data-stack-name requires a value}"; shift 2 ;;
    --region) REGION="${2:?--region requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "$IMAGE_URI" ]]; then
        echo "Error: only one positional IMAGE_URI is allowed" >&2
        exit 2
      fi
      IMAGE_URI="$1"
      shift
      ;;
  esac
done

if [[ -z "$IMAGE_URI" && -f "$CONFIG_FILE" ]]; then
  IMAGE_URI="$(sed -n 's/^IMAGE_URI=//p' "$CONFIG_FILE" | tail -n 1)"
fi
if [[ -z "$IMAGE_URI" ]]; then
  echo "Error: provide IMAGE_URI as an argument/--image-uri or run scripts/push-image.sh first" >&2
  exit 1
fi

AUTH_ENV_NAMES=(
  DASHBOARD_FOUNDER_USERNAME
  DASHBOARD_FOUNDER_PASSWORD
  DASHBOARD_REVIEWER_USERNAME
  DASHBOARD_REVIEWER_PASSWORD
  DASHBOARD_SESSION_SECRET
)
for name in "${AUTH_ENV_NAMES[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Error: required environment variable $name is not set" >&2
    exit 1
  fi
done
if ((${#DASHBOARD_FOUNDER_PASSWORD} < 12)); then
  echo "Error: DASHBOARD_FOUNDER_PASSWORD must contain at least 12 characters" >&2
  exit 1
fi
if ((${#DASHBOARD_REVIEWER_PASSWORD} < 12)); then
  echo "Error: DASHBOARD_REVIEWER_PASSWORD must contain at least 12 characters" >&2
  exit 1
fi
if ((${#DASHBOARD_SESSION_SECRET} < 32)); then
  echo "Error: DASHBOARD_SESSION_SECRET must contain at least 32 characters" >&2
  exit 1
fi

VPC_ID="$(aws ec2 describe-vpcs \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "Error: no default VPC found in $REGION" >&2
  exit 1
fi

SUPABASE_CREDS_SECRET_ARN="$(aws cloudformation describe-stack-resource \
  --stack-name "$DATA_STACK_NAME" \
  --logical-resource-id SupabaseCreds \
  --query 'StackResourceDetail.PhysicalResourceId' \
  --output text --region "$REGION")"
if [[ -z "$SUPABASE_CREDS_SECRET_ARN" || "$SUPABASE_CREDS_SECRET_ARN" == "None" ]]; then
  echo "Error: data stack $DATA_STACK_NAME has no SupabaseCreds secret resource" >&2
  exit 1
fi

SUBNET_ROWS="$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" Name=map-public-ip-on-launch,Values=true \
  --query 'sort_by(Subnets,&AvailabilityZone)[].[SubnetId,AvailabilityZone]' \
  --output text --region "$REGION")"

PUBLIC_SUBNET_ONE=""
PUBLIC_SUBNET_TWO=""
FIRST_AZ=""
while read -r subnet_id availability_zone; do
  [[ -n "$subnet_id" && -n "$availability_zone" ]] || continue
  if [[ -z "$PUBLIC_SUBNET_ONE" ]]; then
    PUBLIC_SUBNET_ONE="$subnet_id"
    FIRST_AZ="$availability_zone"
  elif [[ "$availability_zone" != "$FIRST_AZ" ]]; then
    PUBLIC_SUBNET_TWO="$subnet_id"
    break
  fi
done <<< "$SUBNET_ROWS"

if [[ -z "$PUBLIC_SUBNET_ONE" || -z "$PUBLIC_SUBNET_TWO" ]]; then
  echo "Error: default VPC $VPC_ID needs two public subnets in different Availability Zones" >&2
  exit 1
fi

aws cloudformation deploy \
  --template-file infra/presentation-stack.yaml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    ImageUri="$IMAGE_URI" \
    VpcId="$VPC_ID" \
    PublicSubnetIdOne="$PUBLIC_SUBNET_ONE" \
    PublicSubnetIdTwo="$PUBLIC_SUBNET_TWO" \
    DataStackName="$DATA_STACK_NAME" \
    SupabaseCredsSecretArn="$SUPABASE_CREDS_SECRET_ARN" \
    DashboardFounderUsername="$DASHBOARD_FOUNDER_USERNAME" \
    DashboardFounderPassword="$DASHBOARD_FOUNDER_PASSWORD" \
    DashboardReviewerUsername="$DASHBOARD_REVIEWER_USERNAME" \
    DashboardReviewerPassword="$DASHBOARD_REVIEWER_PASSWORD" \
    DashboardSessionSecret="$DASHBOARD_SESSION_SECRET" \
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

ALB_DNS="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDnsName`].OutputValue | [0]' \
  --output text --region "$REGION")"
if [[ -z "$ALB_DNS" || "$ALB_DNS" == "None" ]]; then
  echo "Error: stack $STACK_NAME has no LoadBalancerDnsName output" >&2
  exit 1
fi

printf 'Dashboard URL: http://%s\n' "$ALB_DNS"
