#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
STACK_NAME="kallo-presentation"

usage() {
  cat <<'EOF'
Usage: scripts/lab-down.sh [options]

Delete the disposable presentation stack and wait for complete removal.

Options:
  --stack-name NAME   Presentation stack name (default: kallo-presentation)
  --region REGION     AWS region (default: us-east-1)
  -h, --help          Show this help
EOF
}

while (($#)); do
  case "$1" in
    --stack-name) STACK_NAME="${2:?--stack-name requires a value}"; shift 2 ;;
    --region) REGION="${2:?--region requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
  echo "Deleted presentation stack: $STACK_NAME"
else
  echo "Presentation stack $STACK_NAME does not exist; nothing to delete."
fi

cat <<'EOF'

Remaining-billables checklist:
  [ ] Confirm no presentation ALB, target group, ECS service/task, or presentation log group remains.
  [ ] The persistent data stack still incurs small S3, DynamoDB, Secrets Manager, API Gateway, and Glue/Athena usage charges.
  [ ] ECR repositories and pushed images remain until explicitly removed.
  [ ] Check the AWS Billing dashboard for unexpected resources or spend.

Vocareum reminder: check the Learner Lab budget before the next session and use End Lab when finished. The total account budget is $50; exceeding it deletes the account.
EOF
