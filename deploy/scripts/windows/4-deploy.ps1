$ErrorActionPreference = "Stop"

$SCRIPT_DIR   = $PSScriptRoot
$DEPLOY_ROOT  = Split-Path (Split-Path $SCRIPT_DIR -Parent) -Parent
$K8S_DIR      = Join-Path $DEPLOY_ROOT "k8s"

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

# Ensure kubeconfig points to the right cluster
aws eks update-kubeconfig `
    --name regwatch-cluster `
    --region $AWS_REGION `
    --profile $AWS_PROFILE | Out-Null

function Ensure-S3NodeRolePolicy {
    Write-Host "Ensuring S3 access on EKS node role..." -ForegroundColor Yellow

    if (-not $S3_BUCKET) {
        Write-Error "S3_BUCKET is empty. Check deploy\scripts\windows\.aws_config.ps1"
        exit 1
    }

    $nodeRoleArn = (aws eks describe-nodegroup `
        --cluster-name regwatch-cluster `
        --nodegroup-name ng-general `
        --region $AWS_REGION `
        --profile $AWS_PROFILE `
        --query "nodegroup.nodeRole" `
        --output text).Trim()

    if (-not $nodeRoleArn -or $nodeRoleArn -eq "None") {
        Write-Error "Cannot find EKS node role."
        exit 1
    }

    $nodeRoleName = ($nodeRoleArn -split "/")[-1]

    $policyObject = @{
        Version = "2012-10-17"
        Statement = @(
            @{
                Effect = "Allow"
                Action = @(
                    "s3:GetBucketLocation",
                    "s3:ListBucket"
                )
                Resource = "arn:aws:s3:::$S3_BUCKET"
            },
            @{
                Effect = "Allow"
                Action = @(
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject"
                )
                Resource = "arn:aws:s3:::$S3_BUCKET/*"
            }
        )
    }

    $policyFile = "$env:TEMP\regwatch-s3-node-policy.json"
    $policyObject | ConvertTo-Json -Depth 10 | Set-Content -Path $policyFile -Encoding ascii

    Write-Host "  Policy file: $policyFile"
    Get-Content $policyFile

    aws iam put-role-policy `
        --role-name $nodeRoleName `
        --policy-name RegWatchS3Access `
        --policy-document "file://$policyFile" `
        --profile $AWS_PROFILE

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to attach S3 policy to node role."
        exit 1
    }

    Write-Host "  S3 policy ready on node role: $nodeRoleName" -ForegroundColor Green
}

# Guard: secrets not filled
$secretsFile = "$K8S_DIR\02-secrets.yaml"
if (-not (Test-Path $secretsFile)) {
    Write-Error "Missing secrets file: $secretsFile. Copy deploy\k8s\02-secrets.example.yaml to deploy\k8s\02-secrets.yaml and fill real values."
    exit 1
}
$secretsContent = Get-Content $secretsFile -Raw

if ($secretsContent -match "CHANGE_ME") {
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "ERROR: deploy\k8s\02-secrets.yaml still contains CHANGE_ME values."
    Write-Host "Please fill in all secrets before deploying."
    Write-Host "============================================" -ForegroundColor Red
    exit 1
}

# Guard: images not set
$backendManifest = "$K8S_DIR\09-backend-deployment.yaml"
$frontendManifest = "$K8S_DIR\12-frontend-deployment.yaml"

$backendContent = Get-Content $backendManifest -Raw
$frontendContent = Get-Content $frontendManifest -Raw

if ($backendContent -match "PLACEHOLDER_ECR_REGISTRY" -or $frontendContent -match "PLACEHOLDER_ECR_REGISTRY") {
    Write-Error "ERROR: Image URIs not set. Run .\2-build-push.ps1 first."
    exit 1
}

Ensure-S3NodeRolePolicy

function Apply($file) {
    if (-not (Test-Path $file)) {
        Write-Error "Missing manifest: $file"
        exit 1
    }

    kubectl apply -f $file
    Write-Host "  Applied: $(Split-Path $file -Leaf)" -ForegroundColor Green
}

function Wait-PodsByLabel($label, $namespace, $timeout) {
    Write-Host "  Waiting for pods with label $label..." -ForegroundColor Yellow

    for ($i = 1; $i -le 30; $i++) {
        $pods = kubectl get pods -n $namespace -l $label --no-headers 2>$null
        if ($pods) {
            break
        }

        Start-Sleep -Seconds 5
    }

    kubectl wait pod `
        -l $label `
        -n $namespace `
        --for=condition=ready `
        --timeout=$timeout
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deploying RegWatch to EKS..."
Write-Host "AWS Profile : $AWS_PROFILE"
Write-Host "AWS Region  : $AWS_REGION"
Write-Host "K8s Dir     : $K8S_DIR"
Write-Host "============================================"

# Base
Write-Host "`n[1/5] Namespace, ConfigMap, Secrets..." -ForegroundColor Yellow
Apply "$K8S_DIR\00-namespace.yaml"
Apply "$K8S_DIR\01-configmap.yaml"
Apply "$K8S_DIR\02-secrets.yaml"

# Databases
Write-Host "`n[2/5] Databases (MySQL, Qdrant, Neo4j)..." -ForegroundColor Yellow
Apply "$K8S_DIR\03-mysql-statefulset.yaml"
Apply "$K8S_DIR\04-mysql-service.yaml"
Apply "$K8S_DIR\05-qdrant-statefulset.yaml"
Apply "$K8S_DIR\06-qdrant-service.yaml"
Apply "$K8S_DIR\07-neo4j-statefulset.yaml"
Apply "$K8S_DIR\08-neo4j-service.yaml"

Wait-PodsByLabel "app=mysql" "regwatch" "300s"
Wait-PodsByLabel "app=qdrant" "regwatch" "300s"
Wait-PodsByLabel "app=neo4j" "regwatch" "300s"

# Backend
Write-Host "`n[3/5] Backend..." -ForegroundColor Yellow
Apply "$K8S_DIR\09-backend-deployment.yaml"
Apply "$K8S_DIR\10-backend-service.yaml"

Write-Host "  Waiting for backend rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/backend -n regwatch --timeout=600s

# Frontend
Write-Host "`n[4/5] Frontend..." -ForegroundColor Yellow
Apply "$K8S_DIR\11-frontend-configmap.yaml"
Apply "$K8S_DIR\12-frontend-deployment.yaml"
Apply "$K8S_DIR\13-frontend-service.yaml"

Write-Host "  Waiting for frontend rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/frontend -n regwatch --timeout=300s

# Ingress
Write-Host "`n[5/5] Ingress (ALB)..." -ForegroundColor Yellow
Apply "$K8S_DIR\14-ingress.yaml"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Deployment submitted!"
Write-Host ""
Write-Host "Check pod status:"
Write-Host "  kubectl get pods -n regwatch"
Write-Host ""
Write-Host "Get ALB URL:"
Write-Host "  kubectl get ingress -n regwatch"
Write-Host "============================================" -ForegroundColor Green

# Wait for ALB URL
Write-Host "`nWaiting for ALB to be provisioned..." -ForegroundColor Yellow

for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 10

    $albUrl = kubectl get ingress regwatch-ingress -n regwatch `
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>$null

    if ($albUrl) {
        Write-Host ""
        Write-Host "Application URL: http://$albUrl" -ForegroundColor Green
        break
    }

    Write-Host "  ($($i * 10)s) Waiting for ALB..."
}

Write-Host ""
Write-Host "Final status:" -ForegroundColor Cyan
kubectl get pods -n regwatch
kubectl get svc -n regwatch
kubectl get ingress -n regwatch
