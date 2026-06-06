#!/usr/bin/env bash
# Build and push Docker images to ECR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_ROOT/.." && pwd)"
K8S_DIR="$DEPLOY_ROOT/k8s"

if [ ! -f "$SCRIPT_DIR/.aws_config" ]; then
  echo "ERROR: .aws_config not found. Run ./1-setup-aws.sh first."
  exit 1
fi
source "$SCRIPT_DIR/.aws_config"

AWS_PROFILE="${AWS_PROFILE:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

aws_cmd() {
  if [ -n "$AWS_PROFILE" ]; then
    aws --profile "$AWS_PROFILE" "$@"
  else
    aws "$@"
  fi
}

echo "============================================"
echo "AWS Profile : ${AWS_PROFILE:-default}"
echo "AWS Region  : $AWS_REGION"
echo "ECR Registry: $ECR_REGISTRY"
echo "Image tag   : $IMAGE_TAG"
echo "============================================"

echo ""
echo "[1/3] Logging in to ECR..."
aws_cmd ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo ""
echo "[2/3] Building backend image..."
docker build \
  --platform linux/amd64 \
  -t "$ECR_REGISTRY/regwatch/backend:$IMAGE_TAG" \
  -f "$PROJECT_ROOT/backend/Dockerfile" \
  "$PROJECT_ROOT/backend"

echo "  Pushing backend..."
docker push "$ECR_REGISTRY/regwatch/backend:$IMAGE_TAG"

echo ""
echo "[3/3] Building frontend image..."
docker build \
  --platform linux/amd64 \
  -t "$ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG" \
  -f "$PROJECT_ROOT/frontend/Dockerfile" \
  "$PROJECT_ROOT/frontend"

echo "  Pushing frontend..."
docker push "$ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG"

echo ""
echo "Patching image URIs in Kubernetes manifests..."
sed -i "s|PLACEHOLDER_ECR_REGISTRY|$ECR_REGISTRY|g" \
  "$K8S_DIR/09-backend-deployment.yaml" \
  "$K8S_DIR/12-frontend-deployment.yaml"

echo ""
echo "============================================"
echo "Images pushed successfully!"
echo "  $ECR_REGISTRY/regwatch/backend:$IMAGE_TAG"
echo "  $ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG"
echo ""
echo "Next step: Run ./3-create-cluster.sh or ./4-deploy.sh"
echo "============================================"
