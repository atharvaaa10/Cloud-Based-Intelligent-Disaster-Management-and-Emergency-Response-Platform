# Live Demonstration Script (10-Minute Presentation)

**Project:** Cloud-Based Intelligent Disaster Management & Emergency Response Platform  
**Target Audience:** Professor / Course Evaluator  
**Duration:** 10 Minutes  

---

## Preparation Checklist (Before the Demo)

1. [ ] Confirm the deployment stacks are active (`aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE`).
2. [ ] Open the web application URL in your browser: `http://<YOUR_ELASTIC_IP>`.
3. [ ] Open the AWS Management Console tabs:
   * **Amazon SQS**: `disaster-incidents-queue` and `disaster-incidents-dlq`.
   * **AWS Lambda**: `disaster-triage-handler-production` $\rightarrow$ Monitor $\rightarrow$ CloudWatch Logs.
   * **Amazon CloudWatch**: `DisasterPlatform-Operations-production` dashboard.
   * **Your Email Inbox**: Confirmed subscription to `disaster-alerts` SNS topic.
4. [ ] Ensure you have captured the pre-demo backup screenshots listed in [Section 9](#9-backup-screenshots-to-capture-in-advance).

---

## 1. Introduction & Architecture Walkthrough (1:00)

### Spoken Script:
> *"Good morning. Today I am presenting our Cloud Computing course project: a Cloud-Based Intelligent Disaster Management and Emergency Response Platform. During natural disasters, conventional monolithic dispatch systems frequently crash because synchronous database writes and manual dispatching cannot handle traffic spikes.*  
> *To solve this, we architected a cloud-native, event-driven solution on AWS. We decouple incident ingestion from analytical processing using Amazon SQS, automate triage using an AWS Lambda serverless consumer, broadcast emergency notifications through Amazon SNS, and protect relational data inside private RDS PostgreSQL subnets with zero internet exposure. All infrastructure is deployed through 10 modular, Free-Tier-compliant CloudFormation stacks."*

---

## 2. Citizen Incident Submission with S3 Photo Upload (2:00)

### Actions:
1. Navigate to `http://<ELASTIC_IP>/login`. Log in with citizen credentials (`citizen@example.com` / `password123` or register a new user).
2. Click **🚨 Report Emergency**.
3. Fill out the report form:
   * **Category**: `Rescue`
   * **People Affected**: `8`
   * **Location**: `Sangam Bridge, Pune`
   * **Description**: `Elderly residents and children are trapped inside a flooded building. Water is rising rapidly and there is severe drowning danger.`
   * **Photo**: Select an emergency sample photo.
4. Click **Submit Emergency Report**.

### Spoken Script:
> *"Notice the photo upload flow: rather than sending heavy image bytes through the backend server, the browser requests a cryptographically signed presigned URL from Amazon S3 and uploads the photo directly. When the citizen clicks Submit, the API persists the record to PostgreSQL and immediately enqueues an asynchronous event to Amazon SQS before returning HTTP 201 in under 40 milliseconds. The citizen is never blocked waiting for triage or external notifications."*

---

## 3. SQS Buffering & Serverless Auto-Triage Execution (2:00)

### Actions:
1. Switch to the **AWS Lambda Console** tab $\rightarrow$ CloudWatch Logs $\rightarrow$ `/aws/lambda/disaster-triage-handler-production`.
2. Open the latest log stream and show the structured JSON log entry:
   ```json
   {"timestamp": "...", "level": "INFO", "action": "triage_success", "incident_id": 1, "score": 90, "priority": "critical"}
   ```
3. Switch to the **Amazon SQS Console** tab. Show that the message arrived, was processed in a batch of 5 with `ReportBatchItemFailures`, and drained from the main queue without hitting the Dead-Letter Queue.

### Spoken Script:
> *"Here in the CloudWatch logs, we see our Python 3.12 Lambda consumer triggered by SQS. It executes our deterministic triage algorithm: granting 35 points for the rescue category, 25 points for population scale, and 30 points for life-threat keywords ('trapped', 'elderly', 'drowning').*  
> *The resulting score of 90 maps to CRITICAL priority. Lambda then calls our backend's internal triage endpoint over HTTP. To prevent unauthorized calls from the public internet, this endpoint requires a shared token retrieved from AWS SSM Parameter Store and verified with a constant-time comparison."*

---

## 4. Admin Dashboard, Auto-Triage Badge & Team Assignment (2:00)

### Actions:
1. Log out and log in as Admin (`admin@example.com` / `admin123`).
2. Show the **Admin Dashboard**:
   * Point out the incident table showing the newly triaged incident with priority upgraded to **CRITICAL** and a **`⚡ Auto-triaged`** badge.
3. Click **View Details** on the incident.
4. Point out the **Auto-Triage Assessment** card:
   * Score: `90 / 100`
   * Rationale: Detailed breakdown string showing categories and matched keyword signals.
   * Timestamp: Auto-triaged timestamp.
5. In the **Assign Rescue Team** card, select `Pune Fire & Rescue Alpha` and click **Assign Team**.

### Spoken Script:
> *"In the Admin portal, the dispatcher immediately sees the updated priority with an 'Auto-triaged' badge and rationale. If an admin had manually set a priority earlier, the system respects human discretion and preserves it.*  
> *Now, when the admin assigns the rescue team, two things happen: the team is marked unavailable in PostgreSQL, and an SNS event is published to notify the team."*

---

## 5. Amazon SNS Email Alert Delivery & Status Resolution (1:00)

### Actions:
1. Switch to your **Email Inbox**.
2. Open the emergency alert email from AWS Notifications:
   * Subject: `CRITICAL ALERT: [rescue] at [Sangam Bridge, Pune]`
   * Body: Priority, Category, People Affected, and Description.
3. In the incident detail view, update status to `in_progress` and then `resolved`.

### Spoken Script:
> *"Within seconds of the triage and assignment events, Amazon SNS fans out alert emails to all subscribers. Once on-site responders complete the rescue, they update the incident to 'Resolved', which automatically releases the assigned rescue team back into the available resource pool."*

---

## 6. Audit Logging & CloudTrail Governance (1:00)

### Actions:
1. In the Admin sidebar, click **📜 Audit Log**.
2. Show the tabular history of events:
   * `AUTH → LOGIN_SUCCESS`
   * `INCIDENT → AUTO_TRIAGED` (Actor: 🤖 System)
   * `INCIDENT → TEAM_ASSIGNED`
   * `INCIDENT → STATUS_UPDATED`
3. Click **Inspect** on an event to display the sanitized JSON payload (pointing out that passwords and tokens are never logged).
4. Briefly switch to AWS CloudTrail in the console to show the management event trail logging infrastructure changes to S3.

### Spoken Script:
> *"For complete accountability, our application-level audit log captures every security-critical action, including actor ID, client IP, and event payloads with automatic redaction of sensitive credentials. Simultaneously, AWS CloudTrail logs all cloud-plane management events to a dedicated S3 bucket with a 90-day lifecycle expiration."*

---

## 7. Failure Injection, DLQ, & Decoupling Demo (1:00)

### Actions:
1. Show how failure isolation works:
   * Run the load test script in a terminal:
     ```powershell
     python scripts/load_test.py --concurrency 20 --count 100
     ```
   * Show requests completing rapidly with low latency while SQS buffers the traffic.
2. Explain the Dead-Letter Queue (DLQ):
   > *"If the backend API were temporarily stopped, the Lambda consumer would fail its HTTP callbacks. SQS retries the message 3 times with exponential backoff before isolating it in `disaster-incidents-dlq`. Once the backend recovers, administrators execute an SQS redrive task to reprocess the queue without losing a single emergency report."*

---

## 8. Backup Fallback Plan (If Live AWS Fails)

If network connectivity, AWS console latency, or account limits interrupt the live demo, seamlessly pivot using the local simulation:
1. Open terminal and run:
   ```bash
   docker compose up -d
   ```
2. Explain:
   > *"Our architecture was built with environment abstraction: when `USE_AWS=false`, the platform switches automatically to in-memory logging stubs and local PostgreSQL, allowing the complete workflow to run locally with 100% feature parity."*
3. Demonstrate the workflow locally at `http://localhost:5173`.

---

## 9. Backup Screenshots to Capture in Advance

Capture and save these screenshots to a folder before your presentation:
1. `01_cloudformation_stacks.png`: AWS CloudFormation showing all stacks `CREATE_COMPLETE`.
2. `02_citizen_report_submission.png`: Citizen reporting form with photo attachment.
3. `03_lambda_cloudwatch_json_logs.png`: CloudWatch log stream showing structured JSON triage output.
4. `04_admin_dashboard_auto_triage_badge.png`: Admin incident table showing `⚡ Auto-triaged` badge.
5. `05_sns_email_notification.png`: Inbox showing the `CRITICAL ALERT` email.
6. `06_audit_log_page.png`: Application audit log page with expanded details.
7. `07_cloudwatch_dashboard.png`: CloudWatch dashboard showing EC2, RDS, SQS, and Lambda metrics.
8. `08_load_test_results.png`: Terminal output of `scripts/load_test.py` showing latency percentiles and queue drain time.
