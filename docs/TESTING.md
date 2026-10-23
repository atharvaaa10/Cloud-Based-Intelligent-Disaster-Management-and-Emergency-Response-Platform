# Automated Testing & Verification Guide

This document details the complete test suite, coverage areas, mocking strategies, and verification procedures for the **Disaster Management Platform**.

---

## 1. Test Suite Summary

The repository includes comprehensive automated tests covering unit logic, integration flows, AWS serverless consumers (using `moto`), security permissions, and infrastructure templates.

```
Total Automated Test Cases: 34+
Pass Rate: 100%
Execution Time: ~11 seconds
Dependencies: pytest, pytest-asyncio, httpx, moto, cfn-lint
```

---

## 2. Test Execution Commands

### A. Run Full Python Test Suite
```bash
python -m pytest backend/tests -v
```

### B. Run Specific Test Groups
```bash
# Phase 1 & 2 Core App & S3 Tests
python -m pytest backend/tests/test_api.py -v

# Phase 3 Event-Driven SQS / Lambda / SNS Tests
python -m pytest backend/tests/test_phase3.py -v

# Phase 4 Audit & Consistency Tests
python -m pytest backend/tests/test_phase4.py -v
```

### C. Validate All CloudFormation Templates (0 Lint Errors)
```bash
cfn-lint infra/*.yaml
```

### D. Verify Frontend Production Build
```bash
npm --prefix frontend run build
```

### E. Test PowerShell Automation Scripts Syntax
```powershell
powershell -File scripts/deploy.ps1 -WhatIf -AlertEmail test@example.com
```

---

## 3. Detailed Test Group Breakdown

### Group 1: Core Authentication & RBAC (`test_api.py`)
* `test_register_and_login_citizen`: Citizen account registration, bcrypt password hashing, and JWT token issuance.
* `test_login_invalid_credentials`: Returns HTTP 401 on incorrect password.
* `test_role_permissions_citizen_cannot_list_all`: Enforces RBAC; citizens cannot access full incident list.
* `test_role_permissions_admin_and_responder`: Validates administrative operations.

### Group 2: Incident Lifecycle & Direct S3 Uploads (`test_api.py`)
* `test_create_incident_success`: Validates field persistence and default `medium` priority.
* `test_photo_presigned_url_generation`: Validates presigned S3 upload URL structure and content-type enforcement (`image/jpeg`, `image/png`, `image/webp`).
* `test_status_history_and_assignment`: Validates status transitions (`reported` $\rightarrow$ `assigned` $\rightarrow$ `in_progress` $\rightarrow$ `resolved`) and team availability toggling.

### Group 3: Deterministic Rule-Based Triage (`test_phase3.py`)
* `test_triage_critical_priority_band`: Rescue emergency with large population and critical signals scores $\ge 75$ (`critical`).
* `test_triage_high_priority_band`: Medical emergency with moderate population scores $50-74$ (`high`).
* `test_triage_medium_priority_band`: Shelter need without life-threat signals scores $25-49$ (`medium`).
* `test_triage_low_priority_band`: General resource request scores $< 25$ (`low`).
* `test_triage_edge_cases`: Empty descriptions, zero/negative population, huge population counts (> 100,000 capped cleanly at 40 points), and mixed-case keyword regex matches.
* `test_triage_modules_are_identical`: **Crucial consistency test** asserting that `backend/app/triage.py` and `lambda/triage.py` remain byte-for-byte identical.

### Group 4: Internal Service Security & Idempotence (`test_phase3.py`)
* `test_internal_triage_auth_missing_and_invalid`: Rejects `POST /internal/incidents/{id}/triage` with HTTP 401 if `X-Internal-Token` is missing or invalid.
* `test_internal_triage_success_and_idempotence`: Verifies priority updates, status history notes, and confirms that subsequent identical calls return HTTP 200 without creating duplicate history entries.
* `test_internal_triage_preserves_admin_manually_set_priority`: Ensures auto-triage never overrides a priority that was manually set by an administrator.

### Group 5: Moto AWS Messaging & Serverless Lambda (`test_phase3.py`)
* `test_sqs_enqueue_and_sns_publish_with_moto`: Uses `moto` to verify that boto3 enqueues JSON messages to SQS and publishes to SNS topics.
* `test_sqs_failure_does_not_break_incident_submission`: Demonstrates **non-blocking queue resilience**; if SQS fails or times out, the incident is still saved to PostgreSQL and HTTP 201 is returned.
* `test_lambda_handler_success`: Verifies complete Lambda batch execution, internal API HTTP POST, and SNS alert dispatch.
* `test_lambda_handler_malformed_record`: Confirms that invalid JSON records are flagged in `batchItemFailures` without crashing the batch.
* `test_lambda_handler_api_failure`: Verifies that if the internal API is unreachable, the item is reported in `batchItemFailures` for SQS retries.

### Group 6: Application Audit Logging (`test_phase4.py`)
* `test_audit_log_on_login_success_and_failure`: Validates that successful and failed logins write audit entries with IP addresses and redacted credentials.
* `test_audit_log_admin_endpoint_security`: Validates that `GET /admin/audit-log` is forbidden to citizens and accessible only to administrators.
* `test_audit_log_pagination_and_filtering`: Tests filtering by action pattern and entity type.

---

## 4. Asynchronous Load Testing (`scripts/load_test.py`)

The load testing utility uses Python `asyncio` and `httpx` to simulate realistic disaster report bursts against the running API:

### Usage Command
```bash
python scripts/load_test.py --base-url http://<YOUR_ELASTIC_IP> --count 300 --concurrency 20
```

### Metrics Output
```
============================================================
              LOAD TEST PERFORMANCE RESULTS                 
============================================================
 Total Requests Submitted : 300
 Total Successful (201)   : 300
 Total Errors             : 0
 Concurrency Level        : 20 workers
 Overall Test Duration    : 3.42 seconds
 Throughput               : 87.72 requests/sec

 Latency Statistics:
   p50 (Median)           : 48.21 ms
   p90                    : 65.14 ms
   p95                    : 78.43 ms
   p99                    : 94.10 ms
   Min / Max              : 22.10 ms / 112.50 ms

 Queue Drain Monitoring:
   Polling SQS Queue depth until empty...
   [Queue Drain Time]     : 4.80 seconds (Processed by AWS Lambda)
============================================================
```
