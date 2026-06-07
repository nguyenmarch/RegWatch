#!/usr/bin/env bash
# Rebuild images and redeploy app code changes to an existing EKS cluster.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$DEPLOY_ROOT/k8s"

if [ ! -f "$SCRIPT_DIR/.aws_config" ]; then
  echo "ERROR: .aws_config not found. Run ./1-setup-aws.sh first."
  exit 1
fi
source "$SCRIPT_DIR/.aws_config"

AWS_PROFILE="${AWS_PROFILE:-}"
CLUSTER_NAME="regwatch-cluster"

aws_cmd() {
  if [ -n "$AWS_PROFILE" ]; then
    aws --profile "$AWS_PROFILE" "$@"
  else
    aws "$@"
  fi
}

patch_configmap() {
  local config_map="$K8S_DIR/01-configmap.yaml"
  sed -i \
    -e "s|MINIO_ENDPOINT: \"s3\\.[^\"]*\\.amazonaws\\.com\"|MINIO_ENDPOINT: \"s3.${AWS_REGION}.amazonaws.com\"|g" \
    -e "s|MINIO_BUCKET: \"[^\"]*\"|MINIO_BUCKET: \"${S3_BUCKET}\"|g" \
    -e "s|MINIO_REGION: \"[^\"]*\"|MINIO_REGION: \"${AWS_REGION}\"|g" \
    "$config_map"
}

echo "============================================"
echo "Redeploying RegWatch code changes..."
echo "AWS Profile : ${AWS_PROFILE:-default}"
echo "AWS Region  : $AWS_REGION"
echo "Image tag   : ${IMAGE_TAG:-latest}"
echo "============================================"

patch_configmap
"$SCRIPT_DIR/2-build-push.sh"

aws_cmd eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

kubectl apply -f "$K8S_DIR/01-configmap.yaml"
kubectl apply -f "$K8S_DIR/09-backend-deployment.yaml"
kubectl apply -f "$K8S_DIR/10-backend-service.yaml"
kubectl apply -f "$K8S_DIR/11-frontend-configmap.yaml"
kubectl apply -f "$K8S_DIR/12-frontend-deployment.yaml"
kubectl apply -f "$K8S_DIR/13-frontend-service.yaml"
kubectl apply -f "$K8S_DIR/14-ingress.yaml"

kubectl rollout restart deployment/backend -n regwatch
kubectl rollout restart deployment/frontend -n regwatch
kubectl rollout status deployment/backend -n regwatch --timeout=600s
kubectl rollout status deployment/frontend -n regwatch --timeout=300s

echo ""
echo "Redeploy complete."
kubectl get pods -n regwatch
kubectl get ingress -n regwatch
