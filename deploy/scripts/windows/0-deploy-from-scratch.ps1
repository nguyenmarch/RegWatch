$ErrorActionPreference = "Stop"

$SCRIPT_DIR   = $PSScriptRoot
$DEPLOY_ROOT  = Split-Path (Split-Path $SCRIPT_DIR -Parent) -Parent
$K8S_DIR      = Join-Path $DEPLOY_ROOT "k8s"

function Assert-SecretsFilled {
    $secretsFile = Join-Path $K8S_DIR "02-secrets.yaml"
    if (-not (Test-Path $secretsFile)) {
        Write-Error "Missing secrets file: $secretsFile. Copy deploy\k8s\02-secrets.example.yaml to deploy\k8s\02-secrets.yaml and fill real values."
        exit 1
    }

    $secretsContent = Get-Content $secretsFile -Raw
    if ($secretsContent -match "CHANGE_ME") {
        Write-Host "============================================" -ForegroundColor Red
        Write-Host "ERROR: deploy\k8s\02-secrets.yaml still contains CHANGE_ME values."
        Write-Host "Fill secrets before running a from-scratch deploy."
        Write-Host "============================================" -ForegroundColor Red
        exit 1
    }
}

function Patch-ConfigMapFromAwsConfig {
    $configFile = Join-Path $SCRIPT_DIR ".aws_config.ps1"
    if (-not (Test-Path $configFile)) {
        Write-Error "ERROR: .aws_config.ps1 not found after AWS setup."
        exit 1
    }

    . $configFile

    $configMap = Join-Path $K8S_DIR "01-configmap.yaml"
    $content = Get-Content $configMap -Raw
    $content = $content -replace 'MINIO_ENDPOINT: "s3\.[^"]+\.amazonaws\.com"', "MINIO_ENDPOINT: `"s3.$AWS_REGION.amazonaws.com`""
    $content = $content -replace 'MINIO_BUCKET: "[^"]+"', "MINIO_BUCKET: `"$S3_BUCKET`""
    $content = $content -replace 'MINIO_REGION: "[^"]+"', "MINIO_REGION: `"$AWS_REGION`""
    Set-Content -Path $configMap -Value $content -Encoding utf8
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deploying RegWatch from scratch..."
Write-Host "This runs: AWS setup -> build/push -> create cluster -> deploy manifests."
Write-Host "============================================"

& "$SCRIPT_DIR\1-setup-aws.ps1"
Patch-ConfigMapFromAwsConfig
Assert-SecretsFilled
& "$SCRIPT_DIR\2-build-push.ps1"
& "$SCRIPT_DIR\3-create-cluster.ps1"
& "$SCRIPT_DIR\4-deploy.ps1"

Write-Host ""
Write-Host "From-scratch deploy complete." -ForegroundColor Green
