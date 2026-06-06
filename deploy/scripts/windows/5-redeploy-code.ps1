$ErrorActionPreference = "Stop"

$SCRIPT_DIR   = $PSScriptRoot
$DEPLOY_ROOT  = Split-Path (Split-Path $SCRIPT_DIR -Parent) -Parent
$K8S_DIR      = Join-Path $DEPLOY_ROOT "k8s"
$configFile   = Join-Path $SCRIPT_DIR ".aws_config.ps1"

if (-not (Test-Path $configFile)) {
    Write-Error "ERROR: .aws_config.ps1 not found. Run .\1-setup-aws.ps1 first."
    exit 1
}

. $configFile

if (-not $AWS_PROFILE) { $AWS_PROFILE = "isb_IsbUsersPS-339388639465" }
if (-not $AWS_REGION) { $AWS_REGION = "us-east-1" }

$env:AWS_PROFILE = $AWS_PROFILE
$env:AWS_REGION  = $AWS_REGION
$IMAGE_TAG = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

function Patch-ConfigMap {
    $configMap = Join-Path $K8S_DIR "01-configmap.yaml"
    if (-not (Test-Path $configMap)) {
        Write-Error "Missing ConfigMap: $configMap"
        exit 1
    }

    $content = Get-Content $configMap -Raw
    $content = $content -replace 'MINIO_ENDPOINT: "s3\.[^"]+\.amazonaws\.com"', "MINIO_ENDPOINT: `"s3.$AWS_REGION.amazonaws.com`""
    $content = $content -replace 'MINIO_BUCKET: "[^"]+"', "MINIO_BUCKET: `"$S3_BUCKET`""
    $content = $content -replace 'MINIO_REGION: "[^"]+"', "MINIO_REGION: `"$AWS_REGION`""
    Set-Content -Path $configMap -Value $content -Encoding utf8
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Redeploying RegWatch code changes..."
Write-Host "AWS Profile : $AWS_PROFILE"
Write-Host "AWS Region  : $AWS_REGION"
Write-Host "Image tag   : $IMAGE_TAG"
Write-Host "============================================"

Patch-ConfigMap

& "$SCRIPT_DIR\2-build-push.ps1"

aws eks update-kubeconfig `
    --name regwatch-cluster `
    --region $AWS_REGION `
    --profile $AWS_PROFILE | Out-Null

kubectl apply -f "$K8S_DIR\01-configmap.yaml"
kubectl apply -f "$K8S_DIR\09-backend-deployment.yaml"
kubectl apply -f "$K8S_DIR\10-backend-service.yaml"
kubectl apply -f "$K8S_DIR\11-frontend-configmap.yaml"
kubectl apply -f "$K8S_DIR\12-frontend-deployment.yaml"
kubectl apply -f "$K8S_DIR\13-frontend-service.yaml"
kubectl apply -f "$K8S_DIR\14-ingress.yaml"

kubectl rollout restart deployment/backend -n regwatch
kubectl rollout restart deployment/frontend -n regwatch

kubectl rollout status deployment/backend -n regwatch --timeout=600s
kubectl rollout status deployment/frontend -n regwatch --timeout=300s

Write-Host ""
Write-Host "Redeploy complete." -ForegroundColor Green
kubectl get pods -n regwatch
kubectl get ingress -n regwatch
