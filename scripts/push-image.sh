#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
REPOSITORY="kallo-dashboard"
TAG="latest"
CONFIG_FILE=".lab-config"

usage() {
  cat <<'EOF'
Usage: scripts/push-image.sh [options]

Build dashboard/ for linux/amd64, create the ECR repository if needed, and push it.

Options:
  --repository NAME   ECR repository name (default: kallo-dashboard)
  --tag TAG           Image tag (default: latest)
  --region REGION     AWS region (default: us-east-1)
  -h, --help          Show this help
EOF
}

while (($#)); do
  case "$1" in
    --repository) REPOSITORY="${2:?--repository requires a value}"; shift 2 ;;
    --tag) TAG="${2:?--tag requires a value}"; shift 2 ;;
    --region) REGION="${2:?--region requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${REGISTRY}/${REPOSITORY}:${TAG}"

docker build --platform linux/amd64 --tag "${REPOSITORY}:${TAG}" dashboard/

if ! aws ecr describe-repositories --repository-names "$REPOSITORY" --region "$REGION" >/dev/null 2>&1; then
  aws ecr create-repository \
    --repository-name "$REPOSITORY" \
    --image-scanning-configuration scanOnPush=true \
    --region "$REGION" >/dev/null
fi

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker tag "${REPOSITORY}:${TAG}" "$IMAGE_URI"
docker push "$IMAGE_URI"

printf 'IMAGE_URI=%s\n' "$IMAGE_URI" > "$CONFIG_FILE"
printf 'Pushed image: %s\nSaved IMAGE_URI to %s\n' "$IMAGE_URI" "$CONFIG_FILE"
