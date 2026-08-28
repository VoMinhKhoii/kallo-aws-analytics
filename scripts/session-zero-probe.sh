#!/usr/bin/env bash
# Session 0: prove the Learner Lab permissions this project depends on before
# building on them. Runs in two passes because an ECS service cannot be created
# before its image exists.
set -euo pipefail

REGION="us-east-1"
STACK_NAME="kallo-probe"
GLUE_SCRIPT_S3_URI=""

usage() {
  cat <<'USAGE'
Usage: scripts/session-zero-probe.sh --glue-script-s3-uri s3://BUCKET/KEY [options]

Pass 1 creates the secret, Lambda, disabled schedule, Glue job, Athena workgroup,
and an ECR repository. The script then builds and pushes a trivial linux/amd64
image with the current federated session credentials, and pass 2 adds the ALB and
Fargate tier and waits for the target to report healthy.

Options:
  --glue-script-s3-uri URI   S3 URI of a trivial uploaded PySpark script (required)
  --stack-name NAME          Probe stack name (default: kallo-probe)
  --region REGION            Region (default: us-east-1)
  -h, --help                 Show this help

Delete the stack as soon as the checks pass: the ALB bills by the hour.
USAGE
}

while (($#)); do
  case "$1" in
    --glue-script-s3-uri) GLUE_SCRIPT_S3_URI="${2:?--glue-script-s3-uri requires a value}"; shift 2 ;;
    --stack-name) STACK_NAME="${2:?--stack-name requires a value}"; shift 2 ;;
    --region) REGION="${2:?--region requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$GLUE_SCRIPT_S3_URI" ]]; then
  echo "Error: --glue-script-s3-uri is required" >&2
  usage >&2
  exit 2
fi

VPC_ID="$(aws ec2 describe-vpcs \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "Error: no default VPC found in $REGION" >&2
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

stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text --region "$REGION"
}

deploy() {
  aws cloudformation deploy \
    --template-file infra/probe-stack.yaml \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
      VpcId="$VPC_ID" \
      PublicSubnetIdOne="$PUBLIC_SUBNET_ONE" \
      PublicSubnetIdTwo="$PUBLIC_SUBNET_TWO" \
      ProbeGlueScriptS3Uri="$GLUE_SCRIPT_S3_URI" \
      ProbeImageUri="$1" \
    --no-fail-on-empty-changeset \
    --region "$REGION"
}

echo "== Pass 1: base resources and the ECR repository =="
deploy ""

REPOSITORY_URI="$(stack_output ProbeEcrRepositoryUri)"
if [[ -z "$REPOSITORY_URI" || "$REPOSITORY_URI" == "None" ]]; then
  echo "Error: probe stack produced no ProbeEcrRepositoryUri" >&2
  exit 1
fi
REGISTRY="${REPOSITORY_URI%%/*}"
IMAGE_URI="${REPOSITORY_URI}:session-zero"

echo "== Secrets Manager and S3 read from a LabRole Lambda =="
PROBE_FUNCTION="$(stack_output ProbeFunctionName)"
aws lambda invoke \
  --function-name "$PROBE_FUNCTION" \
  --region "$REGION" \
  /tmp/kallo-probe-lambda.json >/dev/null
cat /tmp/kallo-probe-lambda.json
printf '\n'

echo "== ECR push with the federated session credentials =="
docker build --platform linux/amd64 --tag "probe:session-zero" infra/probe-image/
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker tag "probe:session-zero" "$IMAGE_URI"
docker push "$IMAGE_URI"

echo "== Pass 2: ALB and Fargate pulling that image via LabRole =="
deploy "$IMAGE_URI"

TARGET_GROUP_ARN="$(stack_output ProbeTargetGroupArn)"
ALB_DNS="$(stack_output ProbeLoadBalancerDnsName)"

echo "== Waiting for the Fargate target to report healthy =="
for _ in $(seq 1 40); do
  HEALTH="$(aws elbv2 describe-target-health \
    --target-group-arn "$TARGET_GROUP_ARN" \
    --query 'TargetHealthDescriptions[0].TargetHealth.State' \
    --output text --region "$REGION" 2>/dev/null || true)"
  printf 'target health: %s\n' "${HEALTH:-none}"
  if [[ "$HEALTH" == "healthy" ]]; then
    break
  fi
  sleep 15
done

if [[ "${HEALTH:-}" != "healthy" ]]; then
  echo "Error: the probe target never became healthy; inspect the ECS task's stopped reason" >&2
  echo "The most likely causes are an ECR pull denial by LabRole or a subnet without a route to the internet." >&2
  exit 1
fi

printf 'Probe URL: http://%s\n' "$ALB_DNS"
curl --fail --silent --show-error "http://${ALB_DNS}/" && printf '\n'

cat <<CLEANUP

All container-tier checks passed. Still to run manually, per infra/README.md:
  - one 2-worker Glue job run
  - one SELECT 1 in the probe Athena workgroup

Then DELETE the probe stack; the ALB bills per hour:
  aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
CLEANUP
