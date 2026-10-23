<#
.SYNOPSIS
    Pre-deployment environment validation check for Disaster Management Platform.
.DESCRIPTION
    Verifies AWS CLI installation, authenticated credentials identity, region,
    optional EC2 Key Pair, and inspects account billing alarms and budgets.
.PARAMETER Region
    Target AWS Region (default: ap-south-1).
.PARAMETER KeyName
    Optional EC2 KeyPair name to verify.
.EXAMPLE
    .\scripts\preflight.ps1 -Region ap-south-1
#>

[CmdletBinding()]
param(
    [string]$Region = "ap-south-1",
    [string]$KeyName = ""
)

$ErrorActionPreference = "Continue"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   DISASTER MANAGEMENT PLATFORM: PREFLIGHT CHECK" -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

$allPassed = $true

# 1. AWS CLI Installed
Write-Host -NoNewline "[1/5] Checking AWS CLI installation... "
try {
    $cliVersion = aws --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS ($cliVersion)" -ForegroundColor Green
    } else {
        Write-Host "FAIL (AWS CLI not found or errored)" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "FAIL ($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# 2. STS Caller Identity (Authenticated Credentials)
Write-Host -NoNewline "[2/5] Checking AWS credentials identity... "
try {
    $identityJson = aws sts get-caller-identity --output json 2>&1
    if ($LASTEXITCODE -eq 0) {
        $identity = $identityJson | ConvertFrom-Json
        Write-Host "PASS" -ForegroundColor Green
        Write-Host "      Account ID : $($identity.Account)" -ForegroundColor DarkGray
        Write-Host "      Caller ARN : $($identity.Arn)" -ForegroundColor DarkGray
    } else {
        Write-Host "FAIL (No valid credentials configured)" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "FAIL ($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# 3. AWS Region Validation
Write-Host -NoNewline "[3/5] Validating target AWS Region ($Region)... "
try {
    $regionCheck = aws ec2 describe-regions --region-names $Region --region $Region --output json 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS" -ForegroundColor Green
    } else {
        Write-Host "WARNING (Unable to verify region $Region)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING ($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. EC2 KeyPair Check (if specified)
if ($KeyName -ne "") {
    Write-Host -NoNewline "[4/5] Checking EC2 KeyPair '$KeyName'... "
    try {
        $keyCheck = aws ec2 describe-key-pairs --key-names $KeyName --region $Region --output json 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "PASS" -ForegroundColor Green
        } else {
            Write-Host "WARNING (KeyPair '$KeyName' not found in $Region)" -ForegroundColor Yellow
            Write-Host "      Note: You can omit KeyName to connect via AWS SSM Session Manager." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "WARNING ($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/5] EC2 KeyPair check: Skipped (Using SSM Session Manager for secure shell)" -ForegroundColor Cyan
}

# 5. Billing Alarms and AWS Budgets Check
Write-Host -NoNewline "[5/5] Checking account cost budgets and billing alarms... "
$hasBudget = $false
try {
    if ($identity -and $identity.Account) {
        $budgetsJson = aws budgets describe-budgets --account-id $identity.Account --output json 2>&1
        if ($LASTEXITCODE -eq 0) {
            $budgets = ($budgetsJson | ConvertFrom-Json).Budgets
            if ($budgets.Count -gt 0) {
                $hasBudget = $true
                Write-Host "PASS ($($budgets.Count) budget(s) found)" -ForegroundColor Green
            }
        }
    }
} catch {
    # Non-fatal if IAM user lacks budgets:ViewBudget permission
}

if (-not $hasBudget) {
    Write-Host "ADVISORY" -ForegroundColor Yellow
    Write-Host "      [!] No active AWS Budget detected in this account." -ForegroundColor Yellow
    Write-Host "      [!] Tip: Deploy infra/budget.yaml or use deploy.ps1 to create a `$5/month budget with alerts." -ForegroundColor DarkYellow
}

Write-Host "`n-------------------------------------------------------" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host " PREFLIGHT CHECK COMPLETED: Environment is ready to deploy!" -ForegroundColor Green
} else {
    Write-Host " PREFLIGHT CHECK FAILED: Please resolve the errors above before running deploy.ps1." -ForegroundColor Red
}
Write-Host "-------------------------------------------------------`n" -ForegroundColor Cyan
