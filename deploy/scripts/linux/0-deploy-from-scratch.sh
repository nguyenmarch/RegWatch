#!/usr/bin/env bash
# Run the full from-scratch EKS deployment flow.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$DEPLOY_ROOT/k8s"

assert_secrets_filled() {
  if [ ! -f "$K8S_DIR/02-secrets.yaml" ]; then
    echo "ERROR: missing deploy/k8s/02-secrets.yaml."
    echo "Copy deploy/k8s/02-secrets.example.yaml to deploy/k8s/02-secrets.yaml and fill real values."
    exit 1
  fi

  if grep -q "CHANGE_ME" "$K8S_DIR/02-secrets.yaml"; then
    echo "============================================"
    echo "ERROR: deploy/k8s/02-secrets.yaml still contains CHANGE_ME values."
    echo "Fill secrets before running a from-scratch deploy."
    echo "============================================"
    exit 1
  fi
}

patch_configmap_from_aws_config() {
  if [ ! -f "$SCRIPT_DIR/.aws_config" ]; then
    echo "ERROR: .aws_config not found after AWS setup."
    exit 1
  fi
  source "$SCRIPT_DIR/.aws_config"

  sed -i \
    -e "s|MINIO_ENDPOINT: \"s3\\.[^\"]*\\.amazonaws\\.com\"|MINIO_ENDPOINT: \"s3.${AWS_REGION}.amazonaws.com\"|g" \
    -e "s|MINIO_BUCKET: \"[^\"]*\"|MINIO_BUCKET: \"${S3_BUCKET}\"|g" \
    -e "s|MINIO_REGION: \"[^\"]*\"|MINIO_REGION: \"${AWS_REGION}\"|g" \
    "$K8S_DIR/01-configmap.yaml"
}

echo "============================================"
echo "Deploying RegWatch from scratch..."
echo "This runs: AWS setup -> build/push -> create cluster -> deploy manifests."
echo "============================================"

"$SCRIPT_DIR/1-setup-aws.sh"
patch_configmap_from_aws_config
assert_secrets_filled
"$SCRIPT_DIR/2-build-push.sh"
"$SCRIPT_DIR/3-create-cluster.sh"
"$SCRIPT_DIR/4-deploy.sh"

echo ""
echo "From-scratch deploy complete."
