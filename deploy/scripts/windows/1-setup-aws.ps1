$ErrorActionPreference = "Stop"

$env:AWS_PROFILE = if ($env:AWS_PROFILE) { $env:AWS_PROFILE } else { "isb_IsbUsersPS-339388639465" }
$env:AWS_REGION  = if ($env:AWS_REGION)  { $env:AWS_REGION }  else { "us-east-1" }

$AWS_REGION = $env:AWS_REGION

$AWS_ACCOUNT_ID = (aws sts get-caller-identity `
    --profile $env:AWS_PROFILE `
    --query Account `
    --output text).Trim()

$S3_BUCKET = "regwatch-documents-$AWS_ACCOUNT_ID"
$ECR_REGISTRY = "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AWS Profile : $env:AWS_PROFILE"
Write-Host "AWS Account : $AWS_ACCOUNT_ID"
Write-Host "Region      : $AWS_REGION"
Write-Host "S3 Bucket   : $S3_BUCKET"
Write-Host "============================================"

# ECR Repositories
Write-Host ""
Write-Host "[1/3] Creating ECR repositories..." -ForegroundColor Yellow

foreach ($repo in @("regwatch/backend", "regwatch/frontend")) {
    $repoExists = $false

    try {
        aws ecr describe-repositories `
            --repository-names $repo `
            --region $AWS_REGION `
            --profile $env:AWS_PROFILE `
            *> $null

        $repoExists = $true
    } catch {
        $repoExists = $false
    }

    if ($repoExists) {
        Write-Host "  ECR $repo already exists"
    } else {
        $repoUri = aws ecr create-repository `
            --repository-name $repo `
            --region $AWS_REGION `
            --profile $env:AWS_PROFILE `
            --image-scanning-configuration scanOnPush=true `
            --query "repository.repositoryUri" `
            --output text

        Write-Host "  Created: $repoUri"
    }
}

# S3 Bucket
Write-Host ""
Write-Host "[2/3] Creating S3 bucket: $S3_BUCKET" -ForegroundColor Yellow

$bucketExists = $false

try {
    aws s3api head-bucket `
        --bucket $S3_BUCKET `
        --profile $env:AWS_PROFILE `
        *> $null

    $bucketExists = $true
} catch {
    $bucketExists = $false
}

if ($bucketExists) {
    Write-Host "  Bucket already exists"
} else {
    if ($AWS_REGION -eq "us-east-1") {
        aws s3api create-bucket `
            --bucket $S3_BUCKET `
            --region $AWS_REGION `
            --profile $env:AWS_PROFILE
    } else {
        aws s3api create-bucket `
            --bucket $S3_BUCKET `
            --region $AWS_REGION `
            --profile $env:AWS_PROFILE `
            --create-bucket-configuration LocationConstraint=$AWS_REGION
    }

    aws s3api put-bucket-versioning `
        --bucket $S3_BUCKET `
        --versioning-configuration Status=Enabled `
        --profile $env:AWS_PROFILE

    Write-Host "  Bucket created with versioning enabled"
}

# IAM skipped
Write-Host ""
Write-Host "[3/3] Skipping IAM user/access key setup..." -ForegroundColor Yellow
Write-Host "  Reason: this AWS account uses SSO role and IAM user creation is blocked by SCP."
Write-Host "  Use AWS_PROFILE=$env:AWS_PROFILE for AWS CLI commands."

# Save config
$configContent = @"
`$AWS_PROFILE    = "$env:AWS_PROFILE"
`$AWS_ACCOUNT_ID = "$AWS_ACCOUNT_ID"
`$AWS_REGION     = "$AWS_REGION"
`$ECR_REGISTRY   = "$ECR_REGISTRY"
`$S3_BUCKET      = "$S3_BUCKET"
"@

[System.IO.File]::WriteAllText("$PSScriptRoot\.aws_config.ps1", $configContent, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Setup complete!"
Write-Host ""
Write-Host "ECR Backend : $ECR_REGISTRY/regwatch/backend"
Write-Host "ECR Frontend: $ECR_REGISTRY/regwatch/frontend"
Write-Host "S3 Bucket   : $S3_BUCKET"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Do NOT create IAM access keys in this AWS account."
Write-Host "  2. Run: .\2-build-push.ps1"
Write-Host "============================================" -ForegroundColor Green