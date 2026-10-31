# 🛡️ Cloud-Based Intelligent Disaster Management and Emergency Response Platform

An enterprise-grade, cloud-native simulation platform for emergency reporting, automated serverless triage, rescue team dispatch, and real-time operational status tracking built on AWS.

---

## 🏛️ System Architecture

```mermaid
graph TB
    subgraph Clients["Clients & Role Portals"]
        Citizen["👤 Citizen (Reporter)"]
        Admin["👮 Operations Admin"]
    end

    subgraph AWS_Cloud["AWS Cloud Infrastructure (Region: ap-south-1)"]
        subgraph WebCompute["Compute Tier (EC2 / Docker)"]
            Nginx["Nginx Reverse Proxy (Port 80)"]
            FastAPI["FastAPI Backend Application"]
            SPA["React Vite SPA Frontend"]
        end

        subgraph StorageTier["Persistence & Credentials"]
            RDS[("Amazon RDS PostgreSQL 16<br/>(Private Subnets)")]
            S3Photos[("Amazon S3 Bucket<br/>(Presigned Direct Uploads)")]
            SecretsMgr["AWS Secrets Manager<br/>(RDS Password Auto-Management)"]
            SSM["AWS SSM Parameter Store<br/>(Internal Token SecureString)"]
        end

        subgraph EventPipeline["Serverless Event-Driven Pipeline"]
            SQSMain[("Amazon SQS Main Queue<br/>(Non-blocking Buffer)")]
            SQSDLQ[("Amazon SQS Dead-Letter Queue<br/>(14-day Retention)")]
            Lambda["AWS Lambda Function<br/>(Rule-Based Auto-Triage)"]
            SNS["Amazon SNS Topic<br/>(Emergency Email Fan-Out)"]
        end

        subgraph Governance["Observability & Cost Governance"]
            CloudWatch["Amazon CloudWatch<br/>(Dashboard, Alarms, Logs)"]
            CloudTrail["AWS CloudTrail<br/>(Management Events Audit)"]
            S3Audit[("Amazon S3 Audit Bucket<br/>(90-Day Expiration)")]
            Budgets["AWS Budgets<br/>($5 Monthly Limit)"]
        end
    end

    Citizen -->|HTTP Report + Photo| Nginx
    Admin -->|Dashboard & Triage Review| Nginx
    Nginx --> SPA
    Nginx --> FastAPI

    FastAPI -->|Direct Photo Presigned URL| S3Photos
    FastAPI -->|Fetch DB Password on Boot| SecretsMgr
    FastAPI -->|Fetch Token on Boot| SSM
    FastAPI -->|Async ORM / Migrations| RDS
    FastAPI -->|Enqueue Event (Non-blocking)| SQSMain

    SQSMain -->|Batch Trigger (Size 5)| Lambda
    SQSMain -.->|MaxReceiveCount=3 Failures| SQSDLQ
    Lambda -->|Fetch Token| SSM
    Lambda -->|POST /internal/triage| Nginx
    Lambda -->|Publish Priority Alert| SNS
    FastAPI -->|Publish Status/Assignment Alert| SNS

    SNS -->|Email Notification| Admin

    FastAPI -.->|Structured JSON Logs| CloudWatch
    Lambda -.->|JSON Execution Logs| CloudWatch
    CloudWatch -.->|Metric Alarms| SNS
    CloudTrail -->|Log API Events| S3Audit
```

---

## 🧰 Technology Stack

| Layer | Technologies & Tools | Key Role |
| :--- | :--- | :--- |
| **Backend API** | Python 3.12, FastAPI, SQLAlchemy 2.0 (Async), Alembic, Pydantic v2 | High-throughput async REST API, RBAC guards, auto-migrations |
| **Relational DB** | PostgreSQL 16 (Amazon RDS) / SQLite (Local dev) | ACID incident transactions, assignments, audit logging |
| **Frontend UI** | React 19, Vite, React Router v7, Vanilla CSS Design System | Responsive dark-mode citizen and administrative portals |
| **Compute & Proxy**| Docker, Docker Compose, Nginx, Amazon EC2 (`t3.micro`) | Containerized SPA hosting, reverse proxy, login rate limiting |
| **Serverless Triage**| AWS Lambda (Python 3.12), Amazon SQS, Amazon SNS | Event-driven decoupled auto-triage and emergency alerting |
| **Storage & Secrets**| Amazon S3, AWS Secrets Manager, SSM Parameter Store | Direct presigned photo uploads, zero-secrets credential management |
| **Governance & Ops** | AWS CloudTrail, Amazon CloudWatch, AWS Budgets | Management trails, dashboards, metric alarms, cost control |
| **IaC & Automation** | AWS CloudFormation (9 templates), PowerShell 7 | 100% reproducible one-command deployment and teardown |

---

## 📚 Project Documentation Directory

| Document | Purpose & Contents |
| :--- | :--- |
| **[docs/REPORT_CONTENT.md](docs/REPORT_CONTENT.md)** | **Complete Academic Project Report**: Problem statement, objectives, service justifications, data flow walkthrough, security design, cost analysis, and syllabus unit mapping. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | **Architecture & Diagrams**: Mermaid system architecture, VPC subnet network topology, and full end-to-end incident sequence diagram. |
| **[docs/SECURITY.md](docs/SECURITY.md)** | **Security & Hardening Review**: IAM least privilege matrix, network isolation, encryption at rest/transit, zero-secrets policy, Nginx hardening, and production roadmap. |
| **[docs/TESTING.md](docs/TESTING.md)** | **Testing & Verification Guide**: Full suite breakdown (36+ tests), unit rules, moto mocks, load testing procedures, and CloudFormation linting. |
| **[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)** | **10-Minute Presentation Script**: Step-by-step presentation actions, spoken script, failure injection demo, and backup plan. |
| **[docs/AWS_DEPLOY.md](docs/AWS_DEPLOY.md)** | **Manual AWS Deployment Manual**: Detailed step-by-step instructions for deploying stacks individually. |

---

## 🚀 Quick Start (Local Run - Zero Cloud Cost)

The application features full environment abstraction (`USE_AWS=false`), enabling complete local execution with in-memory AWS logging stubs.

### 1. Environment Setup
```bash
# Clone the repository
git clone https://github.com/atharvaaa10/Cloud-Based-Intelligent-Disaster-Management-and-Emergency-Response-Platform.git
cd Cloud-Based-Intelligent-Disaster-Management-and-Emergency-Response-Platform

# Copy local development configuration
cp .env.example .env
```

### 2. Backend Setup
```bash
cd backend
python -m pip install -e .

# Run database migrations
python -m alembic upgrade head

# Seed initial demo accounts, teams, and incidents
python -m app.seed

# Start FastAPI server on port 8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
* **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🔑 Seeded Demo Credentials

> **Role Model Architecture:** Two application roles (citizen, admin). Response teams and shelters are managed resources, not user accounts.

| Role | Email | Password | Permissions & Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@disaster.io` | `admin123` | Full dashboard, assign teams, update priority & status, manage teams & resources, inspect audit log |
| **Citizen** | `citizen@disaster.io` | `cit123` | Report emergencies with photos, track own requests, view live map, updates & safety guidelines |

### Administrative Account Provisioning (CLI)
Admin accounts cannot be registered publicly via the citizen registration form. To provision or promote an administrator account from the command line:
```bash
python -m app.cli create-admin --email ops-admin@disaster.io --name "Lead Controller"
```

---

## 📱 Citizen Portal Features & Walkthrough

The platform includes a dedicated, privacy-preserving Citizen Portal designed for desktop and mobile devices:

1. **Home / Overview (`/citizen/overview`)**:
   - Quick "Report Emergency" action and one-tap emergency call badges (`112`, `108`, `1077`).
   - Summary statistics of citizen's own requests (Total, Active, Resolved).
   - Recent request tracker with color-coded status badges and relative time.
   - Nearest emergency shelters with distance calculation via browser geolocation.
2. **Report Incident (`/citizen/report`)**:
   - Direct emergency reporting with geolocation, category selection, and S3-presigned photo upload.
   - Non-blocking serverless queue handoff.
3. **My Requests (`/citizen/requests`)**:
   - Paginated list of reported incidents with search, status, and category filtering.
   - Interactive Detail Drawer with full timeline, assigned rescue team, and read-only priority.
   - Citizen request cancellation and note addition strictly enforced while status is `reported`.
   - Auto-polling every 30 seconds with optimistic local updates.
4. **Live Map (`/citizen/map`)**:
   - Leaflet/OpenStreetMap dark theme with Map & Satellite toggle.
   - Privacy-preserving public view: citizen sees own incidents in full detail, while other incidents appear as generalized ~500m public category markers.
   - Public shelters, hospitals, relief points, and affected disaster zones.
5. **Resources (`/citizen/resources`)**:
   - Categorized search and filters for Shelters, Hospitals, and Relief Supply points.
   - Real-time distance sorting, capacity status, click-to-call phone numbers, and directions.
   - India emergency helpline directory (`112`, `108`, `101`, `100`, `1078`, `1091`, `1098`, `14567`).
6. **Updates & Notifications (`/citizen/updates`)**:
   - Automatic incident status notifications and broadcast emergency alerts.
   - Unread badges, mark-as-read, and 30-second live auto-refresh.

### 🎬 Citizen Portal Demo Script
```text
1. Register or Log in:
   - Go to http://localhost:5173/login
   - Log in as citizen@disaster.io / cit123 (or click "Register" to create a new citizen account).
2. Overview:
   - View your personal emergency summary and nearby shelters.
   - Click "Report Emergency" or navigate to "Report".
3. Report an Incident:
   - Fill in category (e.g. Medical or Rescue), description, and upload a scene photo.
   - Submit report; observe instant redirect to your requests with SQS background triage.
4. Track Incident:
   - In "My Requests", view your incident status (initially "Reported" and priority "Pending review").
   - Click on the incident row to open the status timeline drawer. Add a supplemental note.
5. Explore Map & Resources:
   - Visit "Live Map" to view your exact incident marker alongside generalized public disaster markers.
   - Visit "Resources" to inspect nearby shelters and tap emergency helplines.
6. Verify Updates:
   - Switch to "Updates" to see real-time alert notifications when your request status transitions.
```


---

## ☁️ One-Command AWS Deployment (Phase 4)

All infrastructure is provisioned through modular CloudFormation templates within **AWS Free Tier** limits ($0.00 / month).

### Preflight Check
```powershell
powershell -File scripts/preflight.ps1 -Region ap-south-1
```

### Automated Full Deployment
```powershell
powershell -File scripts/deploy.ps1 -AlertEmail "your-email@example.com" -Region ap-south-1
```
The script automatically:
1. Validates or generates the SSM Parameter Store internal secret token.
2. Builds the Lambda deployment package (`scripts/build_lambda.py`).
3. Deploys all 10 CloudFormation stacks in exact dependency order.
4. Uploads `lambda.zip` to the dedicated S3 bucket.
5. Prints your live web application URL and CloudWatch Dashboard link.

### Automated Teardown
```powershell
powershell -File scripts/teardown.ps1 -Region ap-south-1
```

---

## 🧪 Automated Testing & Verification

Run the entire automated test suite (36+ tests):
```bash
# Run pytest unit and integration tests (auth, RBAC, triage, moto SQS/SNS, audit logging)
python -m pytest backend/tests -v

# Run CloudFormation linter on all 9 templates (0 errors, 0 warnings)
cfn-lint infra/*.yaml

# Test frontend production bundle build
npm --prefix frontend run build
```

---

## 👥 Project Team

* **Course**: Cloud Computing  
* **Academic Year**: 2026–2027  
* **Repository**: [GitHub Repository](https://github.com/atharvaaa10/Cloud-Based-Intelligent-Disaster-Management-and-Emergency-Response-Platform.git)  
* **Team Members**:
  * *Atharva* — Project Lead & Cloud Architecture
  * *(Team Member 2)* — Backend & Serverless Pipeline
  * *(Team Member 3)* — Frontend UI & Integration
