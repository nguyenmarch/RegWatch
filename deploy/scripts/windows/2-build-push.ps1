$ErrorActionPreference = "Stop"

$SCRIPT_DIR   = $PSScriptRoot
$DEPLOY_ROOT  = Split-Path (Split-Path $SCRIPT_DIR -Parent) -Parent
$PROJECT_ROOT = Split-Path $DEPLOY_ROOT -Parent
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
$env:AWS_REGION = $AWS_REGION

$IMAGE_TAG = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AWS Profile : $AWS_PROFILE"
Write-Host "AWS Region  : $AWS_REGION"
Write-Host "ECR Registry: $ECR_REGISTRY"
Write-Host "Image tag   : $IMAGE_TAG"
Write-Host "============================================"

# Check Docker
Write-Host "`nChecking Docker..." -ForegroundColor Yellow
docker version | Out-Null
Write-Host "  Docker is running"

# ECR Login
Write-Host "`n[1/3] Logging in to ECR..." -ForegroundColor Yellow

aws ecr get-login-password `
    --region $AWS_REGION `
    --profile $AWS_PROFILE |
docker login `
    --username AWS `
    --password-stdin $ECR_REGISTRY

# Backend
Write-Host "`n[2/3] Building backend image..." -ForegroundColor Yellow

docker build `
    --platform linux/amd64 `
    -t "$ECR_REGISTRY/regwatch/backend:$IMAGE_TAG" `
    -f "$PROJECT_ROOT\backend\Dockerfile" `
    "$PROJECT_ROOT\backend"

Write-Host "  Pushing backend..."

docker push "$ECR_REGISTRY/regwatch/backend:$IMAGE_TAG"

# Frontend
Write-Host "`n[3/3] Building frontend image..." -ForegroundColor Yellow

docker build `
    --platform linux/amd64 `
    -t "$ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG" `
    -f "$PROJECT_ROOT\frontend\Dockerfile" `
    "$PROJECT_ROOT\frontend"

Write-Host "  Pushing frontend..."

docker push "$ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG"

# Patch manifest placeholders
Write-Host "`nPatching image URIs in k8s manifests..." -ForegroundColor Yellow

$backendManifest = "$K8S_DIR\09-backend-deployment.yaml"
$frontendManifest = "$K8S_DIR\12-frontend-deployment.yaml"

if (Test-Path $backendManifest) {
    (Get-Content $backendManifest) `
        -replace "PLACEHOLDER_ECR_REGISTRY", $ECR_REGISTRY |
    Set-Content $backendManifest -Encoding utf8
} else {
    Write-Warning "Backend manifest not found: $backendManifest"
}

if (Test-Path $frontendManifest) {
    (Get-Content $frontendManifest) `
        -replace "PLACEHOLDER_ECR_REGISTRY", $ECR_REGISTRY |
    Set-Content $frontendManifest -Encoding utf8
} else {
    Write-Warning "Frontend manifest not found: $frontendManifest"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Images pushed successfully!"
Write-Host "  $ECR_REGISTRY/regwatch/backend:$IMAGE_TAG"
Write-Host "  $ECR_REGISTRY/regwatch/frontend:$IMAGE_TAG"
Write-Host ""
Write-Host "Next step: Run .\3-create-cluster.ps1"
Write-Host "============================================" -ForegroundColor Green
