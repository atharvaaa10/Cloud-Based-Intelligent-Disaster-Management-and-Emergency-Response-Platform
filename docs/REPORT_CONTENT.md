# Academic Project Report Content

## Cloud-Based Intelligent Disaster Management and Emergency Response Platform
**Course Subject:** Cloud Computing  
**Tech Stack:** Python FastAPI, SQLAlchemy, PostgreSQL, React (Vite), Docker, AWS CloudFormation  
**Cloud Infrastructure:** VPC, EC2, RDS PostgreSQL 16, S3, SQS, AWS Lambda, SNS, CloudWatch, CloudTrail, Secrets Manager, SSM Parameter Store  

---

## 1. Problem Statement & Motivation
Natural disasters (such as flash floods, earthquakes, and urban fires) trigger sudden, concentrated surges in emergency calls and relief requests. Traditional municipal emergency dispatch architectures suffer from severe structural bottlenecks:
1. **Synchronous Ingestion Failures**: Traditional monoliths process incident reports synchronously against a relational database and dispatch pipeline. Under sudden peak traffic, database lock contention and downstream timeouts cause submission requests to fail, leaving citizens unable to report life-threatening situations.
2. **Subjective and Delayed Triage**: Initial prioritization is often performed manually by human dispatchers reviewing unstructured text descriptions, introducing dangerous latency before critical rescue teams are dispatched.
3. **Lack of Operational Visibility and Auditability**: In multi-agency disaster responses, tracking which responder changed an incident status or which team was assigned is crucial for accountability and post-incident reviews.
4. **Cloud Cost and Architectural Complexity**: Emergency response systems for regional municipalities must remain cost-efficient during quiet periods while maintaining the ability to buffer and absorb massive bursts during catastrophes.

---

## 2. Project Objectives
* **Asynchronous Buffer Ingestion**: Decouple citizen incident submission from analytical processing using message queues, guaranteeing that an emergency report is persisted and acknowledged immediately without waiting on downstream triage logic.
* **Automated Deterministic Triage**: Implement an event-driven serverless function that automatically scores incident urgency based on emergency category, population scale, and life-threat keyword indicators, adjusting priority levels and notifying dispatchers instantly.
* **Defense-in-Depth Cloud Security**: Construct isolated network tiers (public web compute, private database subnets without internet access), enforce IAM least privilege with zero wildcards on data mutations, and eliminate hardcoded secrets using AWS Secrets Manager and SSM Parameter Store.
* **Full Observability & Governance**: Implement end-to-end management tracking using AWS CloudTrail, persistent application-level audit logging, CloudWatch dashboards, and multi-metric alerting.
* **Zero-Cost Free Tier Compliance & One-Command Automation**: Deliver 100% Infrastructure as Code (IaC) via modular CloudFormation templates deployable through an automated script within AWS Free Tier allowances.

---

## 3. Architecture Overview
The platform employs a hybrid **containerized compute and serverless event-driven architecture**:
* **Web & Ingestion Tier**: Hosted on an Amazon EC2 instance (`t3.micro`) running Amazon Linux 2023. Containerized Nginx acts as a reverse proxy, serving the compiled React Single-Page Application (SPA) and routing `/api` traffic to a Python FastAPI backend.
* **Relational Storage Tier**: Amazon RDS PostgreSQL 16 resides in dedicated private subnets across two Availability Zones with no route to the Internet Gateway, accessible exclusively from the EC2 instance's security group on port 5432.
* **Object Storage Tier**: An Amazon S3 bucket stores citizen-uploaded incident photos with client-side direct upload via cryptographically signed presigned URLs.
* **Asynchronous Event-Driven Pipeline**: Upon incident creation, FastAPI enqueues a JSON event to Amazon SQS. An AWS Lambda function (`python3.12`), triggered by SQS batches of 5 with partial failure reporting (`ReportBatchItemFailures`), computes the triage score, updates the incident via an authenticated internal HTTP endpoint, and publishes an alert to Amazon SNS.

---

## 4. Service-by-Service Justification

| AWS Service | Architectural Role | Technical Justification |
| :--- | :--- | :--- |
| **Amazon VPC** | Network Segmentation | Establishes private and public subnets across 2 AZs. Allows database isolation in private subnets with zero internet ingress/egress. |
| **Amazon EC2** | Web & API Compute | Hosts Docker Compose (FastAPI + Nginx) with predictable performance, container isolation, and systemd process management on a Free Tier `t3.micro` instance. |
| **Amazon RDS** | Relational Database | Provides managed PostgreSQL 16 with automated backups, storage encryption at rest, point-in-time recovery, and private subnet placement. |
| **Amazon S3** | Photo & Audit Storage | Highly durable (99.999999999%) storage for incident photos and CloudTrail logs. Direct presigned URL uploads reduce EC2 bandwidth and memory overhead. |
| **Amazon SQS** | Ingestion Queue & Buffer | Decouples report intake from triage computation. Accommodates traffic bursts without dropping requests; DLQ isolates malformed messages after 3 retries. |
| **AWS Lambda** | Serverless Auto-Triage | Event-driven compute that scales automatically from zero with zero idle cost. Runs outside the VPC to avoid expensive NAT Gateway costs. |
| **Amazon SNS** | Notification Fan-Out | Pub/Sub topic broadcasting urgent alerts to email subscribers and trigger destinations whenever high/critical emergencies or status transitions occur. |
| **Amazon CloudWatch**| Metrics, Logs, Dashboards | Consolidates application stdout logs (via Docker `awslogs`), tracks infrastructure metrics (CPU, disk, queue depth), and executes alarms. |
| **AWS CloudTrail** | Governance & Audit Trail| Delivers immutable record of all AWS control-plane API activity (IAM, EC2, RDS, S3) into a dedicated 90-day retention S3 bucket. |
| **AWS Budgets** | Cost Governance | Sets an automated $5.00 monthly spending limit with notifications at 50% ($2.50) and 100% ($5.00) spend thresholds. |
| **AWS Secrets Manager**| Database Credential Management| Automatically generates and manages RDS master passwords (`ManageMasterUserPassword: true`), eliminating plaintext database credentials. |
| **SSM Parameter Store**| Microservice Secret Distribution | Encrypted `SecureString` parameter store distributing the internal shared token to EC2 and Lambda via IAM and KMS. |

---

## 5. End-to-End Data Flow Walk-Through

1. **Submission**: A citizen submits an incident report via the web UI (`category="rescue"`, `people_affected=12`, `description="Elderly citizens trapped on roof by rising water"`, with an attached photo).
2. **Presigned Upload**: The browser requests a presigned S3 PUT URL from FastAPI, uploads the photo directly to `s3://disaster-photos/incidents/<key>`, and includes `photo_key` in the incident submission payload.
3. **Persistence & Enqueue**: FastAPI inserts the incident record into PostgreSQL with `priority="medium"` and `status="reported"`. Within the same handler, it asynchronously dispatches `{event: "incident.created", incident_id: 101, ...}` to the SQS queue. FastAPI immediately returns HTTP 201 to the citizen in $< 50\text{ ms}$.
4. **Queue Buffering**: The message waits in SQS. Even if the backend API or database experiences temporary load or restart, the queue retains the message for up to 4 days.
5. **Serverless Invocations**: SQS triggers the AWS Lambda triage function with a batch of up to 5 messages.
6. **Rule-Based Triage Computation**: Lambda calculates:
   * Category Weight (`rescue`): $+35$
   * Population Tier ($12$ people): $+25$
   * Keyword Matches (`trapped`, `elderly`, `rising water`): $+15 + 10 + 5 = +30$
   * Total Score: $90 \rightarrow \text{\textbf{Critical}}$ Priority.
7. **Protected Internal API Update**: Lambda calls `POST /internal/incidents/101/triage` with the shared `X-Internal-Token` header. The API verifies the token using `hmac.compare_digest`, updates the database record (`priority="critical"`, `triage_score=90`), records a note in `status_history`, and writes an audit log entry.
8. **Emergency Broadcast**: Lambda publishes an SNS alert with the subject `CRITICAL ALERT: [rescue] at [Downtown Pune]`. Responders and administrative staff receive immediate email notifications.
9. **Dispatch & Resolution**: The administrator logs into the portal, sees the `⚡ Auto-triaged` badge, assigns an available rescue team, and updates status to `in_progress` and finally `resolved`. Each transition records an application audit entry and publishes SNS updates.

---

## 6. Security Design & Defense-in-Depth

* **Network Isolation**: The database has no public IP address, no internet gateway route, and accepts traffic only on TCP port 5432 from the EC2 web server's security group.
* **IAM Least Privilege**: Policies are explicitly restricted to the necessary resource ARNs (e.g., S3 access is scoped exclusively to the `incidents/*` prefix; SQS and SNS policies target only the platform's specific queue and topic ARNs).
* **Zero Secrets in Code**: All sensitive credentials reside in AWS Secrets Manager or SSM Parameter Store.
* **Application API Hardening**:
  * Nginx enforces login rate limiting (`5 requests/minute`) on `/api/auth/login`.
  * Security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `CSP`) mitigate common browser attacks.
  * Internal triage endpoints are restricted by constant-time token comparison and rate-limited.
  * Swagger UI (`/docs`) and OpenAPI schemas are disabled in production mode.

---

## 7. Scalability and Reliability Design

* **Designed for Scalability**: Decoupling the ingestion pipeline using Amazon SQS buffers burst traffic, protecting database connection pools from starvation. AWS Lambda horizontally scales concurrent executions to process queued messages as arrival rates increase. S3 presigned URLs offload heavy photo data transfers from the EC2 instance.
* **Fault Isolation & Retries**: SQS main queue visibility timeout is configured to 60 seconds (greater than Lambda's 15-second timeout). If Lambda fails to process a message, SQS retries up to 3 times before moving the failed record to the Dead-Letter Queue (DLQ), ensuring one poisoned message does not block the queue.
* **Honest Architectural Limits**:
  * *Single-Instance Compute*: The web and API tier runs on a single `t3.micro` EC2 instance. While sufficient for coursework demonstration and moderate loads, it constitutes a single point of failure. A production deployment requires an Auto Scaling Group (ASG) behind an Application Load Balancer (ALB).
  * *Single-AZ Database*: To adhere to Free Tier limitations, RDS is deployed in a single Availability Zone. Production high-availability requires Multi-AZ synchronous replication.

---

## 8. Cost Analysis (AWS Free Tier Breakdown)

All resources were architected specifically to operate within the **AWS Free Tier (12-Month & Always Free)**:

| AWS Resource | Configured Capacity | Free Tier Allowance | Monthly Cost |
| :--- | :--- | :--- | :--- |
| **EC2 Instance** | 1x `t3.micro` (Amazon Linux 2023) | 750 hours/month | **$0.00** |
| **Elastic IP** | 1 IPv4 address attached to instance | Free while instance is running | **$0.00** |
| **RDS PostgreSQL**| 1x `db.t3.micro` Single-AZ (20 GB SSD)| 750 hours/month + 20 GB storage| **$0.00** |
| **S3 Storage** | Photos & CloudTrail logs ($< 1\text{ GB}$) | 5 GB standard storage | **$0.00** |
| **Amazon SQS** | Main Queue + DLQ ($\approx 20,000$ calls) | 1,000,000 requests/month | **$0.00** |
| **AWS Lambda** | 128 MB RAM, 15s timeout ($\approx 20,000$ runs)| 1,000,000 invocations + 400k GB-s| **$0.00** |
| **Amazon SNS** | 1 Topic + Email subscriptions | 1,000 email notifications/month | **$0.00** |
| **CloudWatch** | 1 Dashboard + 5 Metric Alarms + Logs | 3 dashboards, 10 alarms, 5 GB logs| **$0.00** |
| **CloudTrail** | 1 Management Event Trail | First copy of management events free| **$0.00** |
| **AWS Budgets** | 1 Cost Budget ($5 limit) | 2 budgets free per account | **$0.00** |
| **Secrets Manager**| 1 RDS Master Password secret | ~$0.40/secret/month after trial | **~$0.40** |
| **Total Estimated Monthly Spend** | | | **~$0.40 / month** |

---

## 9. Testing & Quality Assurance Summary

The platform was verified through a three-tier testing strategy:
1. **Unit Testing (Pytest)**:
   * Rule-based triage scoring verified across all priority bands (`critical`, `high`, `medium`, `low`).
   * Edge cases tested: zero/negative populations, population overflow (> 100,000 capped cleanly at 40 points), empty descriptions, and case-insensitive keyword regex matching.
   * Automated assertion ensuring `backend/app/triage.py` and `lambda/triage.py` remain byte-for-byte identical.
2. **Integration Testing with Moto & Mocking**:
   * Mocked SQS message enqueue and SNS notification publishing.
   * Verification of non-blocking queue resilience: incident submission succeeds (HTTP 201) even if AWS SQS is unreachable.
   * Lambda handler execution tested for success, malformed message rejection, and API failure with partial batch item reporting (`batchItemFailures`).
   * Application audit logging and RBAC endpoint security verification.
3. **Asynchronous Load Testing (`scripts/load_test.py`)**:
   * Async load generator using `httpx` and `asyncio` simulating 300 concurrent incident submissions.
   * Measures requests/sec, p50 and p95 latency, and monitors SQS queue drain rate.

---

## 10. Limitations & Future Work

* **HTTPS Enforcement**: In the current deployment, traffic between client browsers and the EC2 instance uses unencrypted HTTP on port 80. Future work will integrate an AWS Application Load Balancer with an ACM SSL certificate or configure Let's Encrypt Certbot on Nginx.
* **Mutual TLS / PrivateLink for Serverless Callback**: The Lambda triage function calls the API over public HTTP using a shared secret token. Production hardening would place Lambda in a private subnet and route through an AWS PrivateLink VPC Endpoint or authenticate via IAM SigV4.
* **Geospatial GIS Integration**: Future enhancements will incorporate PostGIS extensions in PostgreSQL to automatically group incidents occurring within a 500-meter radius into unified disaster clusters.

---

## 11. Syllabus Unit Mapping

| Course Syllabus Unit | Project Implementation |
| :--- | :--- |
| **Unit 1: AWS Core Services** | Custom VPC with public/private subnet topology, Internet Gateway, route tables, Elastic IP, EC2 compute configuration, S3 bucket storage with presigned URLs, and IAM role architecture. |
| **Unit 2: Serverless Computing** | AWS Lambda Python 3.12 event consumer, SQS Event Source Mapping with partial batch failure handling (`ReportBatchItemFailures`), and automated CloudWatch log streams. |
| **Unit 3: Cloud Security** | Multi-tier network isolation, Security Group ingress boundaries, AWS Secrets Manager automated credential management, SSM Parameter Store `SecureString` tokens, CloudTrail audit trails, and Nginx rate limiting. |
| **Unit 4: Cloud Databases** | Amazon RDS PostgreSQL 16 deployment in private subnets across two AZs, connection string URL encoding, database encryption at rest, and SQLAlchemy async ORM migrations with Alembic. |
| **Unit 5: Cloud-Native Applications**| Loosely coupled event-driven architecture using Amazon SQS and SNS pub/sub, twelve-factor app configuration via environment variables, containerization via Docker Compose, and 100% automated Infrastructure as Code (IaC) via CloudFormation. |
