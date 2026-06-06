#!/usr/bin/env bash
# Create EKS cluster and install AWS Load Balancer Controller.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EKS_CONFIG="$DEPLOY_ROOT/eks/cluster.yaml"

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

eksctl_profile_args=()
if [ -n "$AWS_PROFILE" ]; then
  eksctl_profile_args=(--profile "$AWS_PROFILE")
fi

for cmd in eksctl helm kubectl aws curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd not installed."
    exit 1
  fi
done

echo "============================================"
echo "AWS Profile : ${AWS_PROFILE:-default}"
echo "AWS Account : $AWS_ACCOUNT_ID"
echo "Region      : $AWS_REGION"
echo "Cluster     : $CLUSTER_NAME"
echo "============================================"

echo ""
echo "[1/5] Creating EKS cluster..."
eksctl create cluster -f "$EKS_CONFIG" "${eksctl_profile_args[@]}"

echo ""
echo "[2/5] Updating kubeconfig..."
aws_cmd eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
kubectl get nodes

echo ""
echo "[3/5] Granting S3 access to EKS node role..."
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

echo "  Attached inline policy RegWatchS3Access to $NODE_ROLE_NAME"

echo ""
echo "[4/5] Installing AWS Load Balancer Controller..."
curl -sL https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json \
  -o /tmp/alb-iam-policy.json

if aws_cmd iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file:///tmp/alb-iam-policy.json >/dev/null 2>&1; then
  echo "  IAM policy created"
else
  echo "  IAM policy already exists"
fi

eksctl create iamserviceaccount \
  --cluster="$CLUSTER_NAME" \
  --region="$AWS_REGION" \
  "${eksctl_profile_args[@]}" \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy" \
  --override-existing-serviceaccounts \
  --approve

helm repo add eks https://aws.github.io/eks-charts >/dev/null 2>&1 || true
helm repo update

CLUSTER_VPC="$(aws_cmd eks describe-cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text)"

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName="$CLUSTER_NAME" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region="$AWS_REGION" \
  --set vpcId="$CLUSTER_VPC"

echo ""
echo "[5/5] Waiting for ALB controller..."
kubectl rollout status deployment/aws-load-balancer-controller -n kube-system --timeout=180s

echo ""
echo "============================================"
echo "EKS cluster ready!"
echo ""
echo "Next step: Run ./4-deploy.sh"
echo "============================================"
