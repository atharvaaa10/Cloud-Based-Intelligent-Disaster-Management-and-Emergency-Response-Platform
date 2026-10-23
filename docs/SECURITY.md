# Security Architecture & Hardening Review

This document provides a comprehensive security review of the **Cloud-Based Intelligent Disaster Management and Emergency Response Platform**, detailing the IAM permissions, network segmentation, encryption, secrets management, audit trails, and known architectural limitations with remediation roadmaps.

---

## 1. IAM Least-Privilege Role Matrix

The platform adheres to the principle of least privilege: IAM roles grant only the minimal AWS API permissions and specific resource ARNs necessary for execution.

### A. EC2 Web Server Role (`disaster-ec2-role`)
Assumed by the EC2 instance profile hosting the Docker container stack.

| Policy Name | Permitted Actions | Target Resource ARN | Justification |
| :--- | :--- | :--- | :--- |
| **S3PhotoStorageAccess** | `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` | `arn:aws:s3:::disaster-response-photos-<ID>/incidents/*` | Upload and serve citizen incident evidence photos. |
| **S3PhotoListAccess** | `s3:ListBucket` (conditioned on `prefix: incidents/*`) | `arn:aws:s3:::disaster-response-photos-<ID>` | Validate object presence without global bucket enumeration. |
| **SecretsManagerDbAccess** | `secretsmanager:GetSecretValue`, `secretsmanager:DescribeSecret` | `arn:aws:secretsmanager:...:secret:disaster-db-secret-*` | Retrieve RDS master PostgreSQL username and password on boot. |
| **SSMInternalTokenAccess** | `ssm:GetParameter` | `arn:aws:ssm:...:parameter/disaster-platform/internal-token` | Fetch shared secret token for internal endpoint authentication. |
| **KMSDecryptAccess** | `kms:Decrypt` (conditioned on caller account) | `*` | Decrypt SecureString parameter from SSM Parameter Store. |
| **SQSIncidentQueueAccess** | `sqs:SendMessage`, `sqs:GetQueueUrl`, `sqs:GetQueueAttributes` | `arn:aws:sqs:...:disaster-incidents-queue` | Enqueue `incident.created` events asynchronously. |
| **SNSTopicAlertsAccess** | `sns:Publish` | `arn:aws:sns:...:disaster-alerts` | Dispatch emergency alerts on assignment and status updates. |
| **CloudWatchLogsAccess** | `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` | `arn:aws:logs:...:log-group:/disaster-platform/*` | Ship application and container logs via Docker awslogs driver. |
| **SSMManagedCore** | AWS Managed Policy | Standard SSM endpoints | Allows secure terminal shell access without opening SSH port 22. |

### B. Lambda Execution Role (`disaster-lambda-role`)
Assumed by the serverless auto-triage consumer function.

| Policy Name | Permitted Actions | Target Resource ARN | Justification |
| :--- | :--- | :--- | :--- |
| **SQSConsumerAccess** | `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` | `arn:aws:sqs:...:disaster-incidents-queue` | Read messages from the queue and delete successfully triaged items. |
| **SNSPublisherAccess** | `sns:Publish` | `arn:aws:sns:...:disaster-alerts` | Broadcast triage results and critical priority alerts. |
| **SSMTokenAccess** | `ssm:GetParameter` | `arn:aws:ssm:...:parameter/disaster-platform/internal-token` | Retrieve internal secret token to authenticate back to the API. |
| **KMSDecryptAccess** | `kms:Decrypt` (conditioned on caller account) | `*` | Decrypt the SSM SecureString internal token. |
| **CloudWatchLogsAccess** | `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` | `arn:aws:logs:...:log-group:/aws/lambda/disaster-triage-handler-*` | Emit structured JSON operational logs for each batch. |

---

## 2. Network Segmentation & Isolation

```
                                  PUBLIC INTERNET
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
         HTTPS / HTTP (Port 80)                       HTTPS (Port 443)
                   ▼                                           ▼
       ┌────────────────────────┐                  ┌────────────────────────┐
       │   Public Subnet (AZ1)  │                  │   External Serverless  │
       │  ┌──────────────────┐  │                  │  ┌──────────────────┐  │
       │  │ EC2 (Web/API)    │◄─┼── HTTP /internal ┼──│ AWS Lambda       │  │
       │  │ Security Group:  │  │   (X-Internal-   │  │ (Auto-Triage)    │  │
       │  │ 80 (0.0.0.0/0)   │  │    Token Header) │  └──────────────────┘  │
       │  │ 22 (Admin IP)    │  │                  └────────────────────────┘
       │  └─────────┬────────┘  │
       └────────────┼───────────┘
                    │ Private PostgreSQL
                    │ Port 5432 (Internal SG Only)
                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             Isolated Private Subnets                   │
       │  ┌──────────────────────────┐                          │
       │  │ RDS PostgreSQL 16 (AZ1)  │  (No Internet Access,    │
       │  │ Security Group:          │   No Public IP,          │
       │  │ 5432 from Web SG Only    │   No NAT Gateway Route)  │
       │  └──────────────────────────┘                          │
       └────────────────────────────────────────────────────────┘
```

* **Public Subnet**: Contains only the EC2 instance hosting Nginx and FastAPI. The WebSecurityGroup allows inbound HTTP (port 80) from `0.0.0.0/0` and SSH (port 22) restricted strictly to `MyIpCidr`.
* **Private Subnets**: RDS PostgreSQL is placed across two private subnets with **no route to the Internet Gateway** and **no NAT Gateway**. `PubliclyAccessible` is set to `false`. The `DbSecurityGroupId` allows inbound TCP port 5432 **exclusively from `WebSecurityGroupId`**. Even if an attacker discovers the database endpoint, it cannot be reached from outside the VPC.
* **Serverless Compute**: AWS Lambda operates outside the VPC to maintain zero NAT Gateway costs while calling the public Elastic IP over HTTP/HTTPS. Lambda has zero direct access to the database or private VPC subnets.

---

## 3. Encryption Strategy

| Layer | Mechanism | Implementation |
| :--- | :--- | :--- |
| **Database at Rest** | AWS KMS / AES-256 | RDS EBS storage volume has `StorageEncrypted: true`. |
| **S3 Photos at Rest** | SSE-S3 (AES-256) | Enforced on bucket via `ServerSideEncryptionConfiguration`. |
| **S3 Audit Logs at Rest** | SSE-S3 (AES-256) | Dedicated CloudTrail bucket with default server-side encryption. |
| **SQS Queues at Rest** | SSE-SQS / KMS | `KmsMasterKeyId: alias/aws/sqs` enabled on Main Queue and DLQ. |
| **SNS Topics at Rest** | SSE-SNS / KMS | `KmsMasterKeyId: alias/aws/sns` enabled on `disaster-alerts`. |
| **Data in Transit** | TLS 1.2+ | All AWS API calls (boto3, SQS, SNS, S3, Secrets Manager, SSM) enforce HTTPS. |

---

## 4. Secrets Management & Zero-Secrets Policy

1. **No Credentials in Git**: Neither AWS access keys nor database passwords are committed to the repository.
2. **AWS Secrets Manager**: Master PostgreSQL database credentials are automatically generated and managed by RDS (`ManageMasterUserPassword: true`). EC2 reads the secret ARN at runtime via the AWS CLI in `UserData`.
3. **SSM Parameter Store SecureString**: The shared internal API token (`X-Internal-Token`) is stored as an encrypted `SecureString` (`/disaster-platform/internal-token`). EC2 and Lambda fetch it on startup via IAM permissions with KMS decryption.
4. **CloudFormation `NoEcho`**: All sensitive parameters are marked `NoEcho: true` to prevent secrets from being exposed in CloudFormation console logs or CLI outputs.
5. **Constant-Time Verification**: The internal endpoint verifies tokens with `hmac.compare_digest` to mitigate timing side-channel attacks.

---

## 5. Audit Logging & Observability

* **CloudTrail Management Trail**: Single-region CloudTrail enabled in `infra/audit.yaml`. Logs all AWS API activity (IAM, EC2, S3, RDS, CloudFormation changes) to an encrypted S3 bucket with a 90-day retention lifecycle.
* **Application Audit Log**: Persistent `audit_log` PostgreSQL table records all security-critical operations:
  * Successful and failed logins (recording IP and email; passwords and tokens are strictly redacted).
  * Priority modifications, team assignments, and status transitions.
  * Team and resource creations, edits, and deletions.
  * Internal Lambda triage executions.
* **CloudWatch Alarms**:
  * EC2 CPU $> 80\%$ for 10 minutes.
  * RDS Free Storage Space $< 2\text{ GB}$.
  * Application 5xx or health check failure errors.
  * SQS Dead-Letter Queue (DLQ) depth $> 0$.
  * Lambda invocation errors $> 0$.

---

## 6. Nginx API Hardening

The frontend Nginx reverse proxy enforces defense-in-depth:
1. **Login Rate Limiting**: `limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;` prevents brute-force credential stuffing against `/api/auth/login`.
2. **Internal Route Rate Limiting**: Rate-limits Lambda triage calls to `10r/s` with burst 20.
3. **Security Headers**:
   * `X-Frame-Options: DENY` (prevents clickjacking).
   * `X-Content-Type-Options: nosniff` (prevents MIME sniffing).
   * `X-XSS-Protection: 1; mode=block` (legacy XSS filtering).
   * `Referrer-Policy: strict-origin-when-cross-origin`.
   * `Content-Security-Policy: default-src 'self' ...`.
4. **Request Body Cap**: `client_max_body_size 10M;` prevents denial-of-service via memory exhaustion.
5. **API Documentation Masking**: `/docs`, `/redoc`, and `/openapi.json` are disabled when `ENV=production`.

---

## 7. Known Architectural Limitations & Production Roadmap

| Current Design | Security Trade-off | Production Improvement Roadmap |
| :--- | :--- | :--- |
| **HTTP-Only on EC2** | Traffic between browser and EC2 is unencrypted on port 80. | Attach an AWS Application Load Balancer (ALB) with an AWS Certificate Manager (ACM) TLS certificate, or install Certbot for Let's Encrypt automated TLS. |
| **Shared Secret Header** | Lambda authenticates with a static shared token over public HTTP. | Migrate to **AWS IAM SigV4 authentication** via Amazon API Gateway, mutual TLS (mTLS), or place Lambda in a VPC with an **AWS PrivateLink VPC Endpoint**. |
| **Single EC2 Instance** | Single point of failure; vulnerability to node outage. | Deploy an **Auto Scaling Group (ASG)** across multiple Availability Zones behind an ALB. |
| **Single-AZ RDS** | Database downtime during hardware failure or maintenance. | Enable **Multi-AZ RDS deployment** with synchronous standby replication. |

---

## 8. Extension: How to Enable HTTPS in Production

### Option A: Custom Domain + Let's Encrypt (Certbot) on EC2
1. Point your domain's DNS `A` record (e.g. `disaster.example.com`) to the EC2 Elastic IP.
2. SSH into the EC2 instance or run via SSM:
   ```bash
   sudo dnf install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d disaster.example.com --non-interactive --agree-tos -m admin@example.com
   ```
3. Certbot automatically configures TLS 1.3, SSL certificates, and HTTP-to-HTTPS 301 redirects.

### Option B: CloudFront CDN + ACM Certificate (AWS Recommended)
1. Request a free SSL certificate in `us-east-1` via AWS Certificate Manager (ACM) for your domain.
2. Create an Amazon CloudFront distribution:
   * Origin: EC2 Elastic IP hostname.
   * Viewer Protocol Policy: `Redirect HTTP to HTTPS`.
   * Custom SSL Certificate: select your ACM certificate.
3. Point your Route 53 or DNS provider CNAME record to the CloudFront distribution domain (`d1234.cloudfront.net`). This terminates TLS at AWS edge locations worldwide with DDoS mitigation via AWS Shield Standard.
