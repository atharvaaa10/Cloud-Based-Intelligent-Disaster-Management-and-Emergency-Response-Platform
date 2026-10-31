# AWS Deployment Guide & Architecture Manual
**Disaster Management and Emergency Response Platform**

This guide provides end-to-end instructions for deploying the complete event-driven platform on AWS using Infrastructure as Code (CloudFormation). All components are engineered to stay strictly within the **AWS Free Tier** while adhering to enterprise cloud security practices: zero hard-coded secrets, private database subnets, decoupled message queues, serverless auto-triage, least-privilege IAM policies, S3 Block Public Access, and automated secret generation.

---

## Architecture Overview (Event-Driven Pipeline)

```mermaid
flowchart TB
    subgraph Internet["Public Internet"]
        User["Citizen / Admin Browser"]
        Subscriber["Admin Alert Email Inbox"]
    end

    subgraph AWS["AWS Cloud (Region: e.g. ap-south-1)"]
        subgraph VPC["VPC: 10.0.0.0/16"]
            IGW["Internet Gateway"]

            subgraph PublicSubnet["Public Subnet (10.0.1.0/24)"]
                EIP["Elastic IP (Static IPv4)"]
                
                subgraph EC2["EC2 Instance (t3.micro / AL2023)"]
                    subgraph Docker["Docker Engine & Compose"]
                        Nginx["Nginx Reverse Proxy (:80)\nRate-limited /internal/"]
                        FastAPI["FastAPI Backend (:8000)\nUvicorn ASGI Server"]
                    end
                    IAM["EC2 Instance Profile\n(Least-Privilege Role)"]
                end
            end

            subgraph PrivateSubnets["Private Subnets (Isolated, No IGW Route)"]
                direction LR
                PrivSub1["Private Subnet 1\n(10.0.11.0/24 - AZ-a)"]
                PrivSub2["Private Subnet 2\n(10.0.12.0/24 - AZ-b)"]
                
                RDS[("Amazon RDS PostgreSQL 16\n(db.t3.micro, Single-AZ, 20GB)\nEncrypted Storage")]
                PrivSub1 --- RDS
                PrivSub2 --- RDS
            end
        end

        subgraph EventServices["Event-Driven Messaging & Serverless"]
            SQS[("Amazon SQS Main Queue\n(disaster-incident-queue)\nLong Polling: 20s | Visibility: 60s")]
            DLQ[("Amazon SQS Dead-Letter Queue\n(disaster-incident-dlq)\nRetention: 14 days | MaxReceive: 3")]
            Lambda["AWS Lambda Function (Python 3.12)\n(disaster-triage-handler)\nRule-Based Priority Scorer"]
            SNS["Amazon SNS Topic\n(disaster-alerts)\nEmergency Notifications"]
        end

        subgraph ManagedServices["AWS Managed Storage & Security"]
            S3[("Amazon S3 Bucket\nPhotos & Lambda Artifacts\nBlock Public Access: ON")]
            SM["AWS Secrets Manager\nRDS & Internal Tokens"]
            CW["Amazon CloudWatch\nAlarms & Log Groups"]
        end
    end

    %% Network & Traffic Flows
    User -->|1. Submit Incident / Photo| EIP
    EIP --> Nginx
    Nginx -->|Proxy :8000| FastAPI
    FastAPI -->|2. Save Record| RDS
    FastAPI -->|3. Async Event Push (Non-blocking)| SQS
    FastAPI -->|Direct Presigned PUT/GET| S3
    
    SQS -->|4. Event Source Mapping (Batch: 5)| Lambda
    SQS -.->|Failed 3x (Poison Pill)| DLQ
    
    Lambda -->|5. HTTP POST /internal/.../triage\n(X-Internal-Token auth)| EIP
    Lambda -->|6. Publish Triage Alert| SNS
    FastAPI -->|Assignment / Status Alerts| SNS
    SNS -->|Email Notification| Subscriber
    
    CW -.->|Monitor DLQ & Queue Age| SNS
    IAM -->|Read Secrets| SM
```

---

## Why SQS Decouples Submission from Processing (Report Reference)

> In high-concurrency disaster emergencies, sudden surges of incoming citizen reports can overwhelm downstream processing services, leading to timeout errors, system degradation, or dropped requests. By placing **Amazon Simple Queue Service (SQS)** directly behind the ingestion endpoint (`POST /incidents`), the disaster platform decouples report persistence from background evaluation. The API confirms database persistence and immediately returns an HTTP 201 acknowledgment to the citizen in under 50 milliseconds, pushing an event to SQS asynchronously. Downstream workers (AWS Lambda) consume messages at a controlled throughput, isolating the ingest path from transient database pressure, external network latencies, or downstream component failures. If downstream processing encounters errors, SQS retries the message with exponential backoff and automatically diverts poison-pill payloads to a **Dead-Letter Queue (DLQ)** after three failed delivery attempts without losing citizen data.

---

## AWS Services Used in this Project

| AWS Service | Role in this Project | Free Tier & Cost Impact |
| :--- | :--- | :--- |
| **Amazon SQS** | Decouples report ingestion from background triage; absorbs traffic bursts and buffers load. | **Free Tier eligible** (1,000,000 requests/month free forever). |
| **SQS Dead-Letter Queue** | Isolates unprocessable or poisoned messages with 14-day retention for auditing and redriving. | **Free Tier eligible** (included in SQS allocation). |
| **AWS Lambda** (Python 3.12) | Serverless event consumer executing rule-based auto-triage outside the VPC without database connections. | **Free Tier eligible** (1,000,000 invocations + 400,000 GB-seconds/month free forever). |
| **Amazon SNS** | Publishes real-time disaster alerts, status updates, and CloudWatch alarms to subscribed emails. | **Free Tier eligible** (1,000,000 publishes + 1,000 email deliveries/month free). |
| **Amazon CloudWatch Alarms** | Monitors DLQ message accumulation, queue age (> 5 min), and Lambda execution failures. | **Free Tier eligible** (10 standard metric alarms free forever). |
| **Amazon VPC** | Isolated network (`10.0.0.0/16`) with segmented public and private subnets across 2 AZs. | **Free** ($0.00/month). |
| **Amazon EC2** (`t3.micro`) | Hosts containerized backend and Nginx reverse proxy on Amazon Linux 2023. | **Free Tier eligible** (750 hours/month free for 12 months). |
| **Amazon Elastic IP** | Static public IPv4 address ensuring persistent endpoints for web users and Lambda callbacks. | Free while attached to a running instance. |
| **Amazon RDS PostgreSQL** (`db.t3.micro`) | Managed relational database in private subnets with automated backups and encrypted storage. | **Free Tier eligible** (750 hours/month + 20 GB storage free for 12 months). |
| **AWS Secrets Manager** | Securely generates, encrypts, and rotates RDS master passwords. | ~$0.40/month per active secret. |
| **Amazon S3** | Encrypted object storage for incident scene photos and serverless deployment zips (`lambda.zip`). | **Free Tier eligible** (5 GB storage free for 12 months). |
| **AWS IAM** | Granular least-privilege roles for EC2 instance profile and Lambda execution. | **Free** ($0.00/month). |

---

## Prerequisites

1. **AWS CLI (v2)** installed and configured:
   ```powershell
   aws configure
   aws sts get-caller-identity
   ```

2. **Your Current Public IP** (for restricting SSH access):
   ```powershell
   $MY_IP = "$((Invoke-RestMethod https://checkip.amazonaws.com).Trim())/32"
   Write-Host "My IP CIDR: $MY_IP"
   ```

3. **Optional EC2 Key Pair**:
   ```powershell
   aws ec2 create-key-pair --key-name disaster-key --query 'KeyMaterial' --output text > disaster-key.pem
   ```

---

## Deployment Steps (CloudFormation)

The infrastructure is split into 6 modular CloudFormation templates in `infra/`. Deploy them in this exact order:

```
network ──> storage ──> database ──> messaging ──> compute ──> (build & upload lambda.zip) ──> lambda
```

Set common deployment variables:
```powershell
$REGION = "ap-south-1"  # or us-east-1
$ENV_NAME = "production"
$ALERT_EMAIL = "your-email@example.com"  # Email to receive emergency alerts
```

### Fast Track: One-Command Deployment (Recommended)

You can deploy the entire architecture automatically using the Phase 4 deployment script:

```powershell
# 1. Run Preflight Validation Check:
powershell -File scripts/preflight.ps1 -Region ap-south-1

# 2. Run Full Deployment (automates SSM token, lambda zip build/upload, and 10 stacks):
powershell -File scripts/deploy.ps1 -AlertEmail "your-email@example.com" -Region ap-south-1
```

---

### Manual Step-by-Step Deployment (Alternative)

If you prefer deploying each CloudFormation stack individually, execute the steps below in exact sequence:

#### Step 0: Create SSM Parameter Store Shared Token
Before deploying compute or lambda, create the internal authentication token in SSM Parameter Store:
```powershell
# Generate a random 32-character token and store as SecureString:
$TOKEN = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 })).Replace('+','-').Replace('/','_').Replace('=','')
aws ssm put-parameter `
  --name "/disaster-platform/internal-token" `
  --type "SecureString" `
  --value $TOKEN `
  --description "Shared secret token for Disaster Platform internal triage endpoint" `
  --region $REGION `
  --overwrite
```

#### Step 1: Deploy Network Stack
Creates VPC, 1 public subnet, 2 private subnets, Internet Gateway, and security groups.
```powershell
aws cloudformation deploy `
  --template-file infra/network.yaml `
  --stack-name disaster-network `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      MyIpCidr=$MY_IP `
  --tags Project=DisasterResponse
```

#### Step 2: Deploy Storage Stack
Creates the private S3 photo bucket with Block Public Access ON and SSE-S3 encryption.
```powershell
aws cloudformation deploy `
  --template-file infra/storage.yaml `
  --stack-name disaster-storage `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      AllowedOrigin="*" `
  --tags Project=DisasterResponse
```

#### Step 3: Deploy Database Stack
Provisions Amazon RDS PostgreSQL 16 (`db.t3.micro`) and auto-generates master credentials in Secrets Manager.
```powershell
aws cloudformation deploy `
  --template-file infra/database.yaml `
  --stack-name disaster-database `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      NetworkStackName=disaster-network `
      DbInstanceClass=db.t3.micro `
      DbAllocatedStorage=20 `
  --tags Project=DisasterResponse
```
*(Takes approximately 5–8 minutes to provision).*

#### Step 4: Deploy Messaging Stack
Creates SQS main queue (60s visibility, 20s long polling), Dead-Letter Queue (DLQ, 14-day retention), and SNS topic `disaster-alerts` with email subscription.
```powershell
aws cloudformation deploy `
  --template-file infra/messaging.yaml `
  --stack-name disaster-messaging `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      AlertEmail=$ALERT_EMAIL `
  --tags Project=DisasterResponse
```

> [!IMPORTANT]
> Check your email inbox for an email from **AWS Notifications** with subject `AWS Notification - Subscription Confirmation`. Click **Confirm subscription** to activate alert delivery.

#### Step 5: Deploy Audit Stack (CloudTrail)
Creates dedicated S3 audit log bucket with 90-day lifecycle expiration and single-region management CloudTrail.
```powershell
aws cloudformation deploy `
  --template-file infra/audit.yaml `
  --stack-name disaster-audit `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
  --tags Project=DisasterResponse
```

#### Step 6: Deploy Cost Budget Stack
Sets an automated $5.00 monthly spending limit with notifications at 50% ($2.50) and 100% ($5.00) thresholds.
```powershell
aws cloudformation deploy `
  --template-file infra/budget.yaml `
  --stack-name disaster-budget `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      AlertEmail=$ALERT_EMAIL `
      BudgetLimitAmount=5 `
  --tags Project=DisasterResponse
```

#### Step 7: Deploy Compute Stack
Creates EC2 instance (`t3.micro`), Elastic IP, and IAM role granting S3, Secrets Manager, SSM Parameter Store, SQS, and SNS access.
```powershell
aws cloudformation deploy `
  --template-file infra/compute.yaml `
  --stack-name disaster-compute `
  --region $REGION `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      NetworkStackName=disaster-network `
      StorageStackName=disaster-storage `
      DatabaseStackName=disaster-database `
      MessagingStackName=disaster-messaging `
  --tags Project=DisasterResponse
```

#### Step 8: Package & Deploy Serverless Lambda Auto-Triage Stack

1. **Package the Lambda artifact**:
   ```powershell
   python scripts/build_lambda.py
   ```
2. **Upload package to S3**:
   ```powershell
   $STORAGE_BUCKET = (aws cloudformation describe-stacks `
     --stack-name disaster-storage `
     --region $REGION `
     --query "Stacks[0].Outputs[?OutputKey=='PhotoBucketName'].OutputValue" `
     --output text).Trim()
   aws s3 cp lambda/lambda.zip "s3://$STORAGE_BUCKET/lambda.zip" --region $REGION
   ```
3. **Deploy Lambda Stack**:
   ```powershell
   aws cloudformation deploy `
     --template-file infra/lambda.yaml `
     --stack-name disaster-lambda `
     --region $REGION `
     --capabilities CAPABILITY_NAMED_IAM `
     --parameter-overrides `
         EnvironmentName=$ENV_NAME `
         MessagingStackName=disaster-messaging `
         ComputeStackName=disaster-compute `
         StorageStackName=disaster-storage `
         LambdaCodeS3Bucket=$STORAGE_BUCKET `
         LambdaCodeS3Key=lambda.zip `
     --tags Project=DisasterResponse
   ```

#### Step 9: Deploy Monitoring Stack
Creates CloudWatch Operations Dashboard and alarms for EC2 CPU > 80%, RDS Low Free Storage, and Application Health Check failures.
```powershell
aws cloudformation deploy `
  --template-file infra/monitoring.yaml `
  --stack-name disaster-monitoring `
  --region $REGION `
  --parameter-overrides `
      EnvironmentName=$ENV_NAME `
      ComputeStackName=disaster-compute `
      DatabaseStackName=disaster-database `
      MessagingStackName=disaster-messaging `
      LambdaStackName=disaster-lambda `
  --tags Project=DisasterResponse
```

---

## Verifying the End-to-End Event-Driven Pipeline

### 1. Check API Health
```powershell
$PUBLIC_IP = (aws cloudformation describe-stacks `
  --stack-name disaster-compute `
  --region $REGION `
  --query "Stacks[0].Outputs[?OutputKey=='PublicIp'].OutputValue" `
  --output text).Trim()

curl "http://$PUBLIC_IP/api/health"
```
**Expected HTTP 200 Output**:
```json
{
  "status": "ok",
  "database": "connected",
  "environment": "production",
  "aws_enabled": true
}
```

### 2. End-to-End Triage & Notification Flow Test
1. Open `http://<PUBLIC_IP>` in your browser.
2. Log in as a citizen or register an account.
3. Submit a critical report:
   - **Category**: `rescue`
   - **People Affected**: `12`
   - **Description**: `Building collapsed after landslide, multiple elderly residents trapped inside`
4. Observe the flow:
   - Submission completes immediately (< 50ms) without waiting for triage.
   - SQS receives the `{event: "incident.created"}` message.
   - Lambda processes the message, evaluates score = **85** (**CRITICAL**), and calls `/internal/incidents/{id}/triage`.
   - Incident priority in database automatically upgrades from `medium` to `critical`.
   - Lambda publishes an SNS alert with subject `[CRITICAL EMERGENCY ALERT] #1 [RESCUE] at ...`.
   - Your email inbox receives the emergency alert formatted with all triage details.
   - The administrative dashboard displays the `⚡ Auto-triaged` badge.

### 3. Run Queue Buffering Benchmark (Load Test)
Execute the load test tool to demonstrate high-concurrency queue buffering:
```powershell
python scripts/load_test.py --base-url "http://$PUBLIC_IP" --count 100 --concurrency 15
```
This tool:
- Submits 100 incidents concurrently and records p50/p95 latency and requests/second.
- Polls the backend until all 100 incidents are triaged.
- Prints the exact queue drain duration and processing rate.

---

## Failure Handling & DLQ Redrive Demonstration

To demonstrate fault tolerance and resilience during an evaluation or defense:

1. **Simulate Outage**: Stop the backend container on EC2:
   ```bash
   ssh -i disaster-key.pem ec2-user@<PUBLIC_IP>
   docker compose -f /opt/disaster-platform/docker-compose.prod.yml stop backend
   ```
2. **Submit New Reports**: Submit incidents via the API or load test. The ingest endpoint fails, or if sent directly to SQS, messages queue up.
3. **Observe Lambda Retries**: Lambda attempts to deliver triage results to `/internal/...`, encounters connection refused, and reports batch item failures.
4. **DLQ Divergence**: After 3 failed delivery attempts (`maxReceiveCount: 3`), SQS automatically routes the messages into the Dead-Letter Queue (`disaster-incident-dlq`).
5. **Alarm Trigger**: CloudWatch alarm `disaster-dlq-messages-alarm` triggers, sending an alarm notification to the SNS topic.
6. **Recovery**: Restart the backend service:
   ```bash
   docker compose -f /opt/disaster-platform/docker-compose.prod.yml start backend
   ```
7. **Redrive Dead Letters**: Redrive the poisoned messages back into the primary queue using AWS CLI:
   ```powershell
   $DLQ_ARN = (aws cloudformation describe-stacks --stack-name disaster-messaging --region $REGION --query "Stacks[0].Outputs[?OutputKey=='DisasterQueueDLQArn'].OutputValue" --output text).Trim()
   $QUEUE_ARN = (aws cloudformation describe-stacks --stack-name disaster-messaging --region $REGION --query "Stacks[0].Outputs[?OutputKey=='DisasterQueueArn'].OutputValue" --output text).Trim()

   aws sqs start-message-move-task --source-arn $DLQ_ARN --destination-arn $QUEUE_ARN --region $REGION
   ```
   Lambda immediately consumes the redriven messages, applies triage, and empties the DLQ!

---

## Infrastructure Teardown (Clean Removal)

### Fast Track: One-Command Teardown (Recommended)
```powershell
powershell -File scripts/teardown.ps1 -Region ap-south-1
```

### Manual Teardown (Reverse Dependency Order)
If deleting stacks manually, empty S3 buckets first and delete stacks in reverse order:

```powershell
$REGION = "ap-south-1"

# 1. Delete Monitoring Stack:
aws cloudformation delete-stack --stack-name disaster-monitoring --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-monitoring --region $REGION

# 2. Delete Lambda Stack:
aws cloudformation delete-stack --stack-name disaster-lambda --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-lambda --region $REGION

# 3. Delete Compute Stack (EC2, Elastic IP):
aws cloudformation delete-stack --stack-name disaster-compute --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-compute --region $REGION

# 4. Delete Cost Budget Stack:
aws cloudformation delete-stack --stack-name disaster-budget --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-budget --region $REGION

# 5. Empty and Delete Audit Stack (CloudTrail):
$AUDIT_BUCKET = (aws cloudformation describe-stacks --stack-name disaster-audit --region $REGION --query "Stacks[0].Outputs[?OutputKey=='AuditLogsBucketName'].OutputValue" --output text).Trim()
aws s3 rm "s3://$AUDIT_BUCKET" --recursive --region $REGION
aws cloudformation delete-stack --stack-name disaster-audit --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-audit --region $REGION

# 6. Delete Messaging Stack (SQS, DLQ, SNS):
aws cloudformation delete-stack --stack-name disaster-messaging --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-messaging --region $REGION

# 7. Delete Database Stack (RDS PostgreSQL):
aws cloudformation delete-stack --stack-name disaster-database --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-database --region $REGION

# 8. Empty and Delete Storage Stack (S3 Bucket):
$PHOTO_BUCKET = (aws cloudformation describe-stacks --stack-name disaster-storage --region $REGION --query "Stacks[0].Outputs[?OutputKey=='PhotoBucketName'].OutputValue" --output text).Trim()
aws s3 rm "s3://$PHOTO_BUCKET" --recursive --region $REGION
aws cloudformation delete-stack --stack-name disaster-storage --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-storage --region $REGION

# 9. Delete Network Stack (VPC, Subnets, Route Tables, IGW):
aws cloudformation delete-stack --stack-name disaster-network --region $REGION
aws cloudformation wait stack-delete-complete --stack-name disaster-network --region $REGION

# 10. Optional: Remove SSM Parameter Store Secret
aws ssm delete-parameter --name "/disaster-platform/internal-token" --region $REGION
```

---

## Estimated Monthly Cost Breakdown

| Resource | Sizing / Allocation | Free Tier (First 12 Months) | Standard Post-Free Tier Rate |
| :--- | :--- | :--- | :--- |
| **Amazon SQS & DLQ** | 2 Queues, < 50,000 requests | **$0.00** (1,000,000 requests/mo free) | ~$0.02 / month |
| **AWS Lambda** | 128 MB, 15s timeout, ~50k runs | **$0.00** (1M requests + 400k GB-s free) | ~$0.05 / month |
| **Amazon SNS** | 1 Topic, < 5,000 alerts | **$0.00** (1M publishes free) | ~$0.03 / month |
| **CloudWatch Alarms** | 5 Metric Alarms | **$0.00** (10 standard alarms free) | ~$0.50 / month |
| **CloudWatch Dashboard** | 1 Custom Dashboard | **$0.00** (3 dashboards free) | ~$3.00 / month |
| **AWS CloudTrail** | 1 Management Trail + S3 (90-day retention) | **$0.00** (First trail free + S3 free tier) | ~$0.10 / month |
| **AWS Budgets** | 1 Monthly Cost Budget | **$0.00** (2 budgets free per account) | ~$0.00 / month |
| **Amazon EC2** | `t3.micro` (750 hrs/mo) | **$0.00** | ~$7.50 / month |
| **EBS Root Volume** | 20 GB gp3 | **$0.00** (up to 30 GB free) | ~$1.60 / month |
| **Public IPv4** | Elastic IP | ~$3.65 / month ($0.005/hr) | ~$3.65 / month |
| **Amazon RDS PostgreSQL** | `db.t3.micro` (750 hrs) + 20 GB | **$0.00** | ~$14.50 / month |
| **AWS Secrets Manager** | 1 Master DB Secret | ~$0.40 / month | ~$0.40 / month |
| **Amazon S3** | Photos + lambda.zip (< 1 GB) | **$0.00** | ~$0.05 / month |
| **Total Estimated Spend** | **24/7 Full Production Run** | **~$4.05 / month** | **~$31.40 / month** |

