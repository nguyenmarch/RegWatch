$ErrorActionPreference = "Stop"

$SCRIPT_DIR   = $PSScriptRoot
$DEPLOY_ROOT  = Split-Path (Split-Path $SCRIPT_DIR -Parent) -Parent

$configFile = "$SCRIPT_DIR\.aws_config.ps1"
if (-not (Test-Path $configFile)) {
    Write-Error "ERROR: .aws_config.ps1 not found. Run .\1-setup-aws.ps1 first."
    exit 1
}

. $configFile

if (-not $AWS_PROFILE) {
    $AWS_PROFILE = "isb_IsbUsersPS-339388639465"
}

if (-not $AWS_REGION) {
    $AWS_REGION = "us-east-1"
}

$env:AWS_PROFILE = $AWS_PROFILE
$env:AWS_REGION  = $AWS_REGION

$CLUSTER_NAME = "regwatch-cluster"

foreach ($cmd in @("eksctl", "helm", "kubectl", "aws")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "ERROR: '$cmd' not found. Run .\0-install-tools.ps1 first."
        exit 1
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AWS Profile : $AWS_PROFILE"
Write-Host "AWS Account : $AWS_ACCOUNT_ID"
Write-Host "Region      : $AWS_REGION"
Write-Host "Cluster     : $CLUSTER_NAME"
Write-Host "============================================"

aws sts get-caller-identity `
    --profile $AWS_PROFILE `
    --output table

# Create EKS cluster
Write-Host ""
Write-Host "[1/5] Creating EKS cluster..." -ForegroundColor Yellow

eksctl create cluster `
    -f "$DEPLOY_ROOT\eks\cluster.yaml" `
    --profile $AWS_PROFILE

# Update kubeconfig
Write-Host ""
Write-Host "[2/5] Updating kubeconfig..." -ForegroundColor Yellow

aws eks update-kubeconfig `
    --name $CLUSTER_NAME `
    --region $AWS_REGION `
    --profile $AWS_PROFILE

Write-Host "kubectl configured for cluster $CLUSTER_NAME" -ForegroundColor Green

# Check cluster
kubectl get nodes

# S3 access for backend pods through the EKS node role
Write-Host ""
Write-Host "[3/5] Granting S3 access to EKS node role..." -ForegroundColor Yellow

$s3PolicyFile = "$env:TEMP\regwatch-s3-node-policy.json"
$s3Policy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::$S3_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::$S3_BUCKET/*"
    }
  ]
}
"@

[System.IO.File]::WriteAllText($s3PolicyFile, $s3Policy, [System.Text.Encoding]::UTF8)

$nodeRoleArn = (aws eks describe-nodegroup `
    --cluster-name $CLUSTER_NAME `
    --nodegroup-name ng-general `
    --region $AWS_REGION `
    --profile $AWS_PROFILE `
    --query "nodegroup.nodeRole" `
    --output text).Trim()

$nodeRoleName = ($nodeRoleArn -split "/")[-1]

aws iam put-role-policy `
    --role-name $nodeRoleName `
    --policy-name RegWatchS3Access `
    --policy-document "file://$s3PolicyFile" `
    --profile $AWS_PROFILE | Out-Null

Write-Host "  Attached inline policy RegWatchS3Access to $nodeRoleName" -ForegroundColor Green

# AWS Load Balancer Controller
Write-Host ""
Write-Host "[4/5] Installing AWS Load Balancer Controller..." -ForegroundColor Yellow

$policyArn = "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy"

Write-Host "Checking ALB IAM policy..."

$existingPolicyArn = aws iam list-policies `
    --scope Local `
    --query "Policies[?PolicyName=='AWSLoadBalancerControllerIAMPolicy'].Arn | [0]" `
    --output text `
    --profile $AWS_PROFILE

if ($existingPolicyArn -eq "None" -or -not $existingPolicyArn) {
    Write-Host "ALB policy does not exist. Trying to create it..."

    $policyUrl = "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json"
    $policyFile = "$env:TEMP\alb-iam-policy.json"

    Invoke-WebRequest -Uri $policyUrl -OutFile $policyFile

    try {
        aws iam create-policy `
            --policy-name AWSLoadBalancerControllerIAMPolicy `
            --policy-document "file://$policyFile" `
            --profile $AWS_PROFILE

        Write-Host "  ALB IAM policy created"
    } catch {
        Write-Warning "Could not create ALB IAM policy."
        Write-Warning "Your AWS SSO role may be blocked by SCP/IAM."
        Write-Warning "Ask admin to create this policy: AWSLoadBalancerControllerIAMPolicy"
        throw
    }
} else {
    $policyArn = $existingPolicyArn
    Write-Host "  ALB IAM policy already exists: $policyArn"
}

Write-Host "Creating IAM service account..."

eksctl create iamserviceaccount `
    --cluster=$CLUSTER_NAME `
    --region=$AWS_REGION `
    --profile=$AWS_PROFILE `
    --namespace=kube-system `
    --name=aws-load-balancer-controller `
    --attach-policy-arn=$policyArn `
    --override-existing-serviceaccounts `
    --approve

helm repo add eks https://aws.github.io/eks-charts 2>$null
helm repo update

$CLUSTER_VPC = (aws eks describe-cluster `
    --name $CLUSTER_NAME `
    --region $AWS_REGION `
    --profile $AWS_PROFILE `
    --query "cluster.resourcesVpcConfig.vpcId" `
    --output text).Trim()

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller `
    -n kube-system `
    --set clusterName=$CLUSTER_NAME `
    --set serviceAccount.create=false `
    --set serviceAccount.name=aws-load-balancer-controller `
    --set region=$AWS_REGION `
    --set vpcId=$CLUSTER_VPC

Write-Host ""
Write-Host "[5/5] Waiting for ALB controller..." -ForegroundColor Yellow

kubectl rollout status deployment/aws-load-balancer-controller `
    -n kube-system `
    --timeout=180s

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "EKS cluster ready!"
Write-Host ""
Write-Host "Next step: Run .\4-deploy.ps1"
Write-Host "============================================" -ForegroundColor Green
