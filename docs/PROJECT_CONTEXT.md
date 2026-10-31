# ResQCloud: Project Context & Architectural Guidelines

**Project:** ResQCloud — Cloud-Based Intelligent Disaster Management and Emergency Response Platform  
**Target Region / Context:** Pune, Maharashtra, India  
**Scope:** Academic Project for Cloud Computing Course (Targeted for AWS Cloud Deployment)  

---

## 1. Project Goal & Phased Approach

The primary objective of **ResQCloud** is to provide a resilient, cloud-native emergency dispatch and disaster response coordination platform tailored for localized municipal crisis scenarios (such as monsoon flooding, waterlogging, building collapses, and medical emergencies across Pune).

* **Phase 1 (Current Focus — Citizen Portal First):**
  * Deliver an intuitive, accessible, and responsive citizen portal for reporting emergencies with photos and geo-coordinates.
  * Provide transparent request tracking ("My Requests") with real-time status transitions and operational deployment timelines.
  * Establish rock-solid API validation, role authentication, and security boundaries.

* **Phase 2 (Subsequent Focus — Admin & Dispatch Portal):**
  * Comprehensive incident queue management, filtering, and priority overriding for incident commanders.
  * Dispatch team assignment, rescue equipment/resource allocation, and live operational status updates (`assigned` → `in_progress` → `resolved`).
  * Immutable audit logging and emergency response telemetry.

---

## 2. Technology Stack

| Layer | Technology | Role & Purpose |
| :--- | :--- | :--- |
| **Frontend** | **React 19 + Vite** | Single-page application (SPA), Vanilla CSS design system, React Router v7, Lucide React icons |
| **Backend** | **FastAPI (Python 3.10+)** | High-performance asynchronous REST API, Pydantic v2 schemas, JWT authentication, RBAC middleware |
| **Database** | **PostgreSQL (Production / RDS)**<br/>*SQLite with aiosqlite for local development* | ACID relational storage for users, incidents, teams, resources, and audit trails |
| **ORM & Migrations** | **SQLAlchemy 2.0 (Async) + Alembic** | Async database access layer, schema definitions, and declarative revision migrations |
| **Cloud Target** | **Amazon Web Services (AWS)** | Enterprise-grade cloud infrastructure (S3, SQS, Lambda, SNS, RDS, EC2, CloudWatch) |

---

## 3. Core Architectural & Development Rules

1. **Zero Hard-Coded Secrets:**
   * Never commit credentials, API keys, database passwords, or JWT secrets to the repository.
   * All configurations must be sourced via environment variables (`.env`) loaded through Pydantic `BaseSettings` (`backend/app/config.py`).
   * When deployed to AWS, leverage AWS Secrets Manager (for RDS database credentials) and AWS Systems Manager Parameter Store (for internal service tokens).

2. **Citizen Boundary & Privilege Restrictions:**
   * **Citizens can NEVER set incident priority or status.**
   * Initial priority is determined solely by automated triage scoring (or default triage algorithms).
   * Initial status is unconditionally set to `reported`.
   * Only dispatchers, incident commanders, or automated system workers can alter incident priority and lifecycle states.
   * The backend `IncidentCreate` schema strictly prohibits `priority` and `status` fields from citizen request payloads.

3. **Backend-Enforced Role-Based Access Control (RBAC):**
   * Security is never entrusted solely to client-side route guards.
   * Two application roles (citizen, admin). Response teams and shelters are managed resources, not user accounts.
   * Every sensitive API endpoint must enforce role dependencies (`require_roles("admin")`).
   * Citizens may only query their own submitted incidents (`/incidents/mine`).

4. **Design System & Aesthetics:**
   * **Dark Theme Default:** Sleek, high-contrast dark palette tailored for emergency operations centers and low-light mobile reporting.
   * **Blue Actions:** Interactive actions, primary buttons, and active link states use high-visibility blue hues (`var(--accent)` / `#2563eb`).
   * **Dual Status Indicators (Text AND Color):** Every priority (`critical`, `high`, `medium`, `low`) and status badge (`reported`, `assigned`, `in_progress`, `resolved`) must communicate severity with both clear textual labels and distinct contextual color coding (accessible and WCAG compliant).
   * **Tri-State View Handling:** Every view and data-fetching component must implement all three UI states:
     1. **Loading State:** Skeletons or contextual spinner animations.
     2. **Empty State:** Clear iconography, descriptive guidance, and immediate call-to-action buttons.
     3. **Error State:** Human-readable explanations, non-blocking feedback, and retry capabilities.

---

## 4. Planned AWS Cloud Mapping & Service Abstraction

The platform is designed with clean architectural service boundaries (`USE_AWS=false` locally vs. `USE_AWS=true` in cloud production):

```
+-----------------------------------------------------------------------------------+
|                                  ResQCloud System                                 |
+-----------------------------------------------------------------------------------+
       |                                                               |
  [Local Dev Mode]                                              [AWS Production]
  (USE_AWS=false)                                               (USE_AWS=true)
       |                                                               |
  * SQLite (aiosqlite)                  ====>            * Amazon RDS (PostgreSQL 16)
  * Local Mock Upload URL Stub          ====>            * Amazon S3 (Presigned Direct Uploads)
  * Synchronous Triage / Log Stubs      ====>            * Amazon SQS (Non-blocking Buffer Queue)
                                                         * AWS Lambda (Rule-Based Auto-Triage Worker)
  * Logged Alert Stubs                  ====>            * Amazon SNS (Emergency Alert Fan-Out)
  * Local Console Logs                  ====>            * Amazon CloudWatch (Structured JSON Logs)
+-----------------------------------------------------------------------------------+
```

### Detailed Mapping:
1. **Photo Uploads → Amazon S3:**
   * Clients request a presigned PUT URL from FastAPI (`/incidents/photo-upload-url`).
   * Photos upload directly from the citizen's browser to an S3 bucket (with strict MIME type and 5 MB size constraints), offloading heavy image traffic from the API server.
   * *Local Abstraction:* Generates a stubbed URL and logs the operation without failing.

2. **Priority Scoring & Triage → Amazon SQS + AWS Lambda:**
   * Incident creation asynchronously enqueues an event message into Amazon SQS.
   * An AWS Lambda triage worker consumes batches from SQS, evaluates risk scoring (based on disaster keywords, affected people count, and casualty risk), and updates the incident priority via a secured internal endpoint (`/internal/triage`).
   * *Local Abstraction:* `enqueue_incident_processing` logs the payload and keeps the incident creation pipeline non-blocking.

3. **Emergency Alerting & Fan-Out → Amazon SNS:**
   * High-priority incidents and status transitions publish notifications to an SNS Topic.
   * Subscribed operations administrators and authorities receive immediate email/SMS notifications.
   * *Local Abstraction:* `publish_disaster_alert` logs the alert event to the console.

4. **Persistence → Amazon RDS for PostgreSQL:**
   * Single-command switch in production via `DATABASE_URL=postgresql+asyncpg://...` without any application code changes, thanks to SQLAlchemy async engine and Alembic migrations.
