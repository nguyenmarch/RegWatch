#!/usr/bin/env bash
# Setup AWS resources: ECR repositories and S3 bucket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

AWS_PROFILE="${AWS_PROFILE:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

aws_cmd() {
  if [ -n "$AWS_PROFILE" ]; then
    aws --profile "$AWS_PROFILE" "$@"
  else
    aws "$@"
  fi
}

AWS_ACCOUNT_ID="$(aws_cmd sts get-caller-identity --query Account --output text)"
S3_BUCKET="regwatch-documents-${AWS_ACCOUNT_ID}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "============================================"
echo "AWS Profile : ${AWS_PROFILE:-default}"
echo "AWS Account : $AWS_ACCOUNT_ID"
echo "Region      : $AWS_REGION"
echo "S3 Bucket   : $S3_BUCKET"
echo "============================================"

echo ""
echo "[1/2] Creating ECR repositories..."

for repo in regwatch/backend regwatch/frontend; do
  if aws_cmd ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "  ECR $repo already exists"
  else
    aws_cmd ecr create-repository \
      --repository-name "$repo" \
      --region "$AWS_REGION" \
      --image-scanning-configuration scanOnPush=true \
      --query 'repository.repositoryUri' \
      --output text
  fi
done

echo ""
echo "[2/2] Creating S3 bucket: $S3_BUCKET"

if aws_cmd s3api head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1; then
  echo "  Bucket already exists"
else
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws_cmd s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION"
  else
    aws_cmd s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$AWS_REGION" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION"
  fi

  aws_cmd s3api put-bucket-versioning \
    --bucket "$S3_BUCKET" \
    --versioning-configuration Status=Enabled

  echo "  Bucket created with versioning enabled"
fi

cat > "$SCRIPT_DIR/.aws_config" <<EOF
export AWS_PROFILE="$AWS_PROFILE"
export AWS_ACCOUNT_ID="$AWS_ACCOUNT_ID"
export AWS_REGION="$AWS_REGION"
export ECR_REGISTRY="$ECR_REGISTRY"
export S3_BUCKET="$S3_BUCKET"
EOF

echo ""
echo "============================================"
echo "Setup complete!"
echo ""
echo "ECR Backend : $ECR_REGISTRY/regwatch/backend"
echo "ECR Frontend: $ECR_REGISTRY/regwatch/frontend"
echo "S3 Bucket   : $S3_BUCKET"
echo ""
echo "Next steps:"
echo "  1. Fill deploy/k8s/02-secrets.yaml"
echo "  2. Run: ./2-build-push.sh"
echo "============================================"
