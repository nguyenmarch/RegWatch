#!/usr/bin/env bash
# Deploy RegWatch manifests to EKS.
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

ensure_s3_node_role_policy() {
  if [ -z "${S3_BUCKET:-}" ]; then
    echo "ERROR: S3_BUCKET is empty. Check deploy/scripts/linux/.aws_config."
    exit 1
  fi

  echo "Ensuring S3 access on EKS node role..."
  cat > /tmp/regwatch-s3-node-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF

  NODE_ROLE_ARN="$(aws_cmd eks describe-nodegroup \
    --cluster-name "$CLUSTER_NAME" \
    --nodegroup-name ng-general \
    --region "$AWS_REGION" \
    --query "nodegroup.nodeRole" \
    --output text)"
  NODE_ROLE_NAME="${NODE_ROLE_ARN##*/}"

  aws_cmd iam put-role-policy \
    --role-name "$NODE_ROLE_NAME" \
    --policy-name RegWatchS3Access \
    --policy-document file:///tmp/regwatch-s3-node-policy.json

  echo "  S3 policy ready on node role: $NODE_ROLE_NAME"
}

apply_manifest() {
  kubectl apply -f "$1"
  echo "  Applied: $(basename "$1")"
}

aws_cmd eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

if [ ! -f "$K8S_DIR/02-secrets.yaml" ]; then
  echo "ERROR: missing deploy/k8s/02-secrets.yaml."
  echo "Copy deploy/k8s/02-secrets.example.yaml to deploy/k8s/02-secrets.yaml and fill real values."
  exit 1
fi

if grep -q "CHANGE_ME" "$K8S_DIR/02-secrets.yaml"; then
  echo "============================================"
  echo "ERROR: deploy/k8s/02-secrets.yaml still contains CHANGE_ME values."
  echo "Please fill in all secrets before deploying."
  echo "============================================"
  exit 1
fi

if grep -q "PLACEHOLDER_ECR_REGISTRY" "$K8S_DIR/09-backend-deployment.yaml" "$K8S_DIR/12-frontend-deployment.yaml"; then
  echo "ERROR: Image URIs not set. Run ./2-build-push.sh first."
  exit 1
fi

ensure_s3_node_role_policy

echo "============================================"
echo "Deploying RegWatch to EKS..."
echo "AWS Profile : ${AWS_PROFILE:-default}"
echo "AWS Region  : $AWS_REGION"
echo "K8s Dir     : $K8S_DIR"
echo "============================================"

echo ""
echo "[1/5] Namespace, ConfigMap, Secrets..."
apply_manifest "$K8S_DIR/00-namespace.yaml"
apply_manifest "$K8S_DIR/01-configmap.yaml"
apply_manifest "$K8S_DIR/02-secrets.yaml"

echo ""
echo "[2/5] Databases (MySQL, Qdrant, Neo4j)..."
apply_manifest "$K8S_DIR/03-mysql-statefulset.yaml"
apply_manifest "$K8S_DIR/04-mysql-service.yaml"
apply_manifest "$K8S_DIR/05-qdrant-statefulset.yaml"
apply_manifest "$K8S_DIR/06-qdrant-service.yaml"
apply_manifest "$K8S_DIR/07-neo4j-statefulset.yaml"
apply_manifest "$K8S_DIR/08-neo4j-service.yaml"

kubectl wait pod -l app=mysql -n regwatch --for=condition=ready --timeout=300s
kubectl wait pod -l app=qdrant -n regwatch --for=condition=ready --timeout=300s
kubectl wait pod -l app=neo4j -n regwatch --for=condition=ready --timeout=300s

echo ""
echo "[3/5] Backend..."
apply_manifest "$K8S_DIR/09-backend-deployment.yaml"
apply_manifest "$K8S_DIR/10-backend-service.yaml"
kubectl rollout status deployment/backend -n regwatch --timeout=600s

echo ""
echo "[4/5] Frontend..."
apply_manifest "$K8S_DIR/11-frontend-configmap.yaml"
apply_manifest "$K8S_DIR/12-frontend-deployment.yaml"
apply_manifest "$K8S_DIR/13-frontend-service.yaml"
kubectl rollout status deployment/frontend -n regwatch --timeout=300s

echo ""
echo "[5/5] Ingress (ALB)..."
apply_manifest "$K8S_DIR/14-ingress.yaml"

echo ""
echo "Deployment submitted."
echo "Check pod status: kubectl get pods -n regwatch"
echo "Get ALB URL:      kubectl get ingress -n regwatch"

echo ""
echo "Waiting for ALB to be provisioned..."
for _ in $(seq 1 30); do
  ALB_URL="$(kubectl get ingress regwatch-ingress -n regwatch \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  if [ -n "$ALB_URL" ]; then
    echo "Application URL: http://$ALB_URL"
    break
  fi
  sleep 10
done
