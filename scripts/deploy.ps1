<#
.SYNOPSIS
    Automated one-command deployment script for the Disaster Management Platform.
.DESCRIPTION
    Deploys all CloudFormation stacks in exact dependency order:
      1. Network (VPC, Subnets, SGs)
      2. Storage (S3 Photos)
      3. Database (RDS PostgreSQL 16 with Secrets Manager)
      4. Messaging (SQS Main + DLQ, SNS Topic with Email alert)
      5. Audit (CloudTrail management trail + dedicated S3 audit bucket)
      6. Budget (AWS Budgets $5 monthly limit with alerts)
      7. Compute (EC2, Elastic IP, Docker/Nginx auto-bootstrap)
      8. Lambda Package & S3 Upload (builds lambda.zip and copies to S3)
      9. Lambda (Serverless auto-triage consumer + SQS event mapping)
     10. Monitoring (CloudWatch Dashboard + Alarms for CPU, RDS, Health)
.PARAMETER Region
    Target AWS Region (default: ap-south-1).
.PARAMETER AlertEmail
    Email address for SNS emergency notifications and budget threshold alerts.
.PARAMETER KeyName
    Optional EC2 KeyPair name for SSH access (default: none, uses SSM Session Manager).
.PARAMETER MyIpCidr
    CIDR block authorized for direct SSH access (default: 0.0.0.0/0).
.PARAMETER EnvironmentName
    Environment prefix for all resource naming (default: production).
.PARAMETER WhatIf
    Dry-run mode: prints deployment steps and commands without executing live changes.
.EXAMPLE
    .\scripts\deploy.ps1 -AlertEmail "admin@example.com" -Region ap-south-1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AlertEmail,

    [string]$Region = "ap-south-1",
    [string]$KeyName = "",
    [string]$MyIpCidr = "0.0.0.0/0",
    [string]$EnvironmentName = "production",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   DISASTER MANAGEMENT PLATFORM: FULL CLOUD DEPLOY" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Region           : $Region" -ForegroundColor DarkGray
Write-Host " Environment      : $EnvironmentName" -ForegroundColor DarkGray
Write-Host " Alert Email      : $AlertEmail" -ForegroundColor DarkGray
Write-Host " Dry-Run (WhatIf) : $($WhatIf.IsPresent)" -ForegroundColor DarkGray
Write-Host "=======================================================`n" -ForegroundColor Cyan

function Execute-Step {
    param(
        [string]$StepTitle,
        [scriptblock]$Action
    )
    Write-Host "`n>>> $StepTitle" -ForegroundColor Yellow
    if ($WhatIf) {
        Write-Host "  [WhatIf] Step skipped in dry-run mode." -ForegroundColor DarkGray
        return
    }
    & $Action
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Host "ERROR: Step failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host " [SUCCESS] $StepTitle" -ForegroundColor Green
}

# ── 1. Secure Internal Token in SSM Parameter Store ───────────
Execute-Step "[1/10] Verifying SSM Parameter Store Internal Token" {
    $paramName = "/disaster-platform/internal-token"
    $checkParam = aws ssm get-parameter --name $paramName --region $Region --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  + Internal token not found. Generating secure 32-byte cryptographic token..." -ForegroundColor Cyan
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($randomBytes)
        $token = [Convert]::ToBase64String($randomBytes).Replace('+', '-').Replace('/', '_').Replace('=', '')

        aws ssm put-parameter `
            --name $paramName `
            --type "SecureString" `
            --value $token `
            --description "Shared secret token for Disaster Platform internal triage endpoint" `
            --region $Region `
            --overwrite `
            --output text | Out-Null
        Write-Host "  + Created SSM SecureString parameter: $paramName" -ForegroundColor Green
    } else {
        Write-Host "  + Found existing SSM parameter: $paramName" -ForegroundColor Green
    }
}

# ── 2. Network Stack ──────────────────────────────────────────
Execute-Step "[2/10] Deploying Network Infrastructure (VPC, Subnets, SGs)" {
    aws cloudformation deploy `
        --template-file infra/network.yaml `
        --stack-name disaster-network `
        --parameter-overrides EnvironmentName=$EnvironmentName MyIpCidr=$MyIpCidr `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 3. Storage Stack ──────────────────────────────────────────
Execute-Step "[3/10] Deploying S3 Storage Infrastructure" {
    aws cloudformation deploy `
        --template-file infra/storage.yaml `
        --stack-name disaster-storage `
        --parameter-overrides EnvironmentName=$EnvironmentName `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 4. Database Stack ─────────────────────────────────────────
Execute-Step "[4/10] Deploying RDS PostgreSQL Database (Secrets Manager Managed)" {
    aws cloudformation deploy `
        --template-file infra/database.yaml `
        --stack-name disaster-database `
        --parameter-overrides EnvironmentName=$EnvironmentName NetworkStackName=disaster-network `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 5. Messaging Stack ────────────────────────────────────────
Execute-Step "[5/10] Deploying Messaging Infrastructure (SQS, DLQ, SNS)" {
    aws cloudformation deploy `
        --template-file infra/messaging.yaml `
        --stack-name disaster-messaging `
        --parameter-overrides EnvironmentName=$EnvironmentName AlertEmail=$AlertEmail `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 6. Audit Stack ────────────────────────────────────────────
Execute-Step "[6/10] Deploying CloudTrail Management Audit Stack" {
    aws cloudformation deploy `
        --template-file infra/audit.yaml `
        --stack-name disaster-audit `
        --parameter-overrides EnvironmentName=$EnvironmentName `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 7. Budget Stack ───────────────────────────────────────────
Execute-Step "[7/10] Deploying Cost Budget Stack (`$5.00 limit)" {
    aws cloudformation deploy `
        --template-file infra/budget.yaml `
        --stack-name disaster-budget `
        --parameter-overrides EnvironmentName=$EnvironmentName AlertEmail=$AlertEmail BudgetLimitAmount=5 `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 8. Compute Stack ──────────────────────────────────────────
Execute-Step "[8/10] Deploying EC2 Compute Stack & Bootstrapping Containers" {
    $computeParams = @(
        "EnvironmentName=$EnvironmentName",
        "NetworkStackName=disaster-network",
        "StorageStackName=disaster-storage",
        "DatabaseStackName=disaster-database",
        "MessagingStackName=disaster-messaging"
    )
    if ($KeyName -ne "") {
        $computeParams += "KeyName=$KeyName"
    }

    aws cloudformation deploy `
        --template-file infra/compute.yaml `
        --stack-name disaster-compute `
        --parameter-overrides $computeParams `
        --capabilities CAPABILITY_NAMED_IAM `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 9. Package & Deploy Lambda Auto-Triage Consumer ───────────
Execute-Step "[9/10] Packaging and Deploying Serverless Lambda Auto-Triage Consumer" {
    Write-Host "  + Running scripts/build_lambda.py..." -ForegroundColor Cyan
    python scripts/build_lambda.py

    # Fetch storage bucket name
    $storageBucket = aws cloudformation describe-stacks `
        --stack-name disaster-storage `
        --query "Stacks[0].Outputs[?OutputKey=='PhotoBucketName'].OutputValue" `
        --output text `
        --region $Region

    Write-Host "  + Uploading lambda.zip to s3://$storageBucket/lambda.zip..." -ForegroundColor Cyan
    aws s3 cp lambda/lambda.zip "s3://$storageBucket/lambda.zip" --region $Region

    aws cloudformation deploy `
        --template-file infra/lambda.yaml `
        --stack-name disaster-lambda `
        --parameter-overrides EnvironmentName=$EnvironmentName MessagingStackName=disaster-messaging ComputeStackName=disaster-compute StorageStackName=disaster-storage `
        --capabilities CAPABILITY_NAMED_IAM `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── 10. Monitoring Stack ──────────────────────────────────────
Execute-Step "[10/10] Deploying CloudWatch Dashboard & Metric Alarms" {
    aws cloudformation deploy `
        --template-file infra/monitoring.yaml `
        --stack-name disaster-monitoring `
        --parameter-overrides EnvironmentName=$EnvironmentName ComputeStackName=disaster-compute DatabaseStackName=disaster-database MessagingStackName=disaster-messaging LambdaStackName=disaster-lambda `
        --region $Region `
        --no-fail-on-empty-changeset
}

# ── Final Output Summary ──────────────────────────────────────
Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "   DISASTER MANAGEMENT PLATFORM DEPLOYED SUCCESSFULLY" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green

if (-not $WhatIf) {
    try {
        $webUrl = aws cloudformation describe-stacks --stack-name disaster-compute --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" --output text --region $Region
        $healthUrl = aws cloudformation describe-stacks --stack-name disaster-compute --query "Stacks[0].Outputs[?OutputKey=='HealthCheckURL'].OutputValue" --output text --region $Region
        $dashUrl = aws cloudformation describe-stacks --stack-name disaster-monitoring --query "Stacks[0].Outputs[?OutputKey=='DashboardURL'].OutputValue" --output text --region $Region

        Write-Host "`n Access Endpoints:" -ForegroundColor Cyan
        Write-Host "   Web Application : $webUrl" -ForegroundColor White
        Write-Host "   Health Check    : $healthUrl" -ForegroundColor White
        Write-Host "   CloudWatch Dash : $dashUrl" -ForegroundColor White

        Write-Host "`n Action Required:" -ForegroundColor Yellow
        Write-Host "   [!] Check your inbox at '$AlertEmail' and click 'Confirm subscription' on the SNS message." -ForegroundColor Yellow
        Write-Host "   [!] EC2 Docker containers take ~2-3 minutes to finish UserData building." -ForegroundColor DarkGray
    } catch {
        Write-Host "Note: Querying stack outputs encountered a minor warning ($_.Exception.Message)" -ForegroundColor DarkGray
    }
}
Write-Host "=======================================================`n" -ForegroundColor Green
