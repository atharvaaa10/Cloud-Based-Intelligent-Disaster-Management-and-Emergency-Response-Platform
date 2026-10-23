<#
.SYNOPSIS
    Automated teardown script for the Disaster Management Platform.
.DESCRIPTION
    Empties dedicated S3 buckets (photos and audit logs) and deletes all CloudFormation
    stacks in reverse dependency order, cleaning up all AWS resources.
.PARAMETER Region
    Target AWS Region (default: ap-south-1).
.PARAMETER EnvironmentName
    Environment prefix for all resource naming (default: production).
.PARAMETER Force
    Skips interactive confirmation prompt.
.PARAMETER DeleteSsmToken
    Also deletes the /disaster-platform/internal-token SSM Parameter Store secret.
.EXAMPLE
    .\scripts\teardown.ps1 -Region ap-south-1
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1",
    [string]$EnvironmentName = "production",
    [switch]$Force,
    [switch]$DeleteSsmToken
)

$ErrorActionPreference = "Continue"

Write-Host "`n=======================================================" -ForegroundColor Red
Write-Host "   DISASTER MANAGEMENT PLATFORM: INFRASTRUCTURE TEARDOWN" -ForegroundColor Red
Write-Host "=======================================================" -ForegroundColor Red
Write-Host " Region      : $Region" -ForegroundColor DarkGray
Write-Host " Environment : $EnvironmentName" -ForegroundColor DarkGray
Write-Host "=======================================================`n" -ForegroundColor Red

if (-not $Force) {
    $confirm = Read-Host "Are you sure you want to permanently delete ALL Disaster Platform stacks? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Teardown aborted by user." -ForegroundColor Yellow
        exit 0
    }
}

function Remove-StackSafely {
    param(
        [string]$StackName
    )
    Write-Host "`n>>> Deleting CloudFormation stack '$StackName'..." -ForegroundColor Yellow
    $check = aws cloudformation describe-stacks --stack-name $StackName --region $Region 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  + Stack '$StackName' does not exist or already deleted. Skipping." -ForegroundColor DarkGray
        return
    }

    aws cloudformation delete-stack --stack-name $StackName --region $Region
    Write-Host "  + Waiting for stack '$StackName' deletion to complete..." -ForegroundColor Cyan
    aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region
    Write-Host " [SUCCESS] Stack '$StackName' deleted." -ForegroundColor Green
}

# ── 1. Empty S3 Buckets First ─────────────────────────────────
Write-Host "`n>>> [1/10] Emptying dedicated S3 buckets..." -ForegroundColor Yellow

# Photo Bucket
try {
    $photoBucket = aws cloudformation describe-stacks `
        --stack-name disaster-storage `
        --query "Stacks[0].Outputs[?OutputKey=='PhotoBucketName'].OutputValue" `
        --output text `
        --region $Region 2>&1
    if ($photoBucket -and $photoBucket -ne "None" -and $LASTEXITCODE -eq 0) {
        Write-Host "  + Emptying photo bucket: s3://$photoBucket..." -ForegroundColor Cyan
        aws s3 rm "s3://$photoBucket" --recursive --region $Region
    }
} catch {
    Write-Host "  - Photo bucket could not be queried or already empty." -ForegroundColor DarkGray
}

# Audit Logs Bucket
try {
    $auditBucket = aws cloudformation describe-stacks `
        --stack-name disaster-audit `
        --query "Stacks[0].Outputs[?OutputKey=='AuditLogsBucketName'].OutputValue" `
        --output text `
        --region $Region 2>&1
    if ($auditBucket -and $auditBucket -ne "None" -and $LASTEXITCODE -eq 0) {
        Write-Host "  + Emptying audit logs bucket: s3://$auditBucket..." -ForegroundColor Cyan
        aws s3 rm "s3://$auditBucket" --recursive --region $Region
    }
} catch {
    Write-Host "  - Audit bucket could not be queried or already empty." -ForegroundColor DarkGray
}

# ── 2. Delete Stacks in Reverse Dependency Order ──────────────
Remove-StackSafely "disaster-monitoring"
Remove-StackSafely "disaster-lambda"
Remove-StackSafely "disaster-compute"
Remove-StackSafely "disaster-budget"
Remove-StackSafely "disaster-audit"
Remove-StackSafely "disaster-messaging"
Remove-StackSafely "disaster-database"
Remove-StackSafely "disaster-storage"
Remove-StackSafely "disaster-network"

# ── 3. Optional: Delete SSM Parameter Store Secret ────────────
if ($DeleteSsmToken) {
    Write-Host "`n>>> Deleting SSM Parameter /disaster-platform/internal-token..." -ForegroundColor Yellow
    aws ssm delete-parameter --name "/disaster-platform/internal-token" --region $Region 2>&1 | Out-Null
    Write-Host " [SUCCESS] SSM parameter removed." -ForegroundColor Green
}

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "   ALL DISASTER PLATFORM RESOURCES REMOVED SUCCESSFULLY" -ForegroundColor Green
Write-Host "=======================================================`n" -ForegroundColor Green
