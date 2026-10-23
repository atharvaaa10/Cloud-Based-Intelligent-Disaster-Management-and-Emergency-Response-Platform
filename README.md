# Cloud-Based Intelligent Disaster Management and Emergency Response Platform

A cloud-ready simulation platform for emergency reporting, automated triage, team dispatch, and real-time status tracking.

## System Architecture

```text
[ Citizen ] ──────> [ FastAPI REST API ] <────── [ Admin / Responder ]
 (React UI)                 │                           (React UI)
                            ├───> [ PostgreSQL / SQLite ]
                            ├───> [ S3 Storage (Stub) ]
                            ├───> [ SQS Queue (Stub) ]
                            └───> [ SNS Notifications (Stub) ]
```

- **Citizens**: Report emergencies (category, location, description, affected count) and monitor status history.
- **Admins**: Review reported incidents, assign priority (low/med/high/critical), and dispatch available rescue/medical teams.
- **Responders**: Update operational status (`in_progress` -> `resolved`), add status notes, and automatically release teams upon resolution.

---

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2
- **Database**: PostgreSQL 15 (Docker) / SQLite (zero-config local dev)
- **Frontend**: React (Vite), React Router v7, Vanilla CSS design system (Dark mode)
- **Authentication**: JWT tokens (OAuth2 password flow) with `bcrypt` password hashing
- **Testing**: `pytest` and `pytest-asyncio` with HTTPX test client

---

## Seeded Demo Credentials

Run `python -m app.seed` to populate the database with these accounts:

| Role | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@disaster.io` | `admin123` | Full dashboard, assign teams, update priority & status, manage teams & resources |
| **Responder** | `responder@disaster.io` | `resp123` | View dashboard & details, update incident status (`in_progress`, `resolved`) |
| **Citizen** | `citizen@disaster.io` | `cit123` | Report emergencies, track own requests and status history timeline |

---

## Quickstart (Local Run)

### 1. Environment Setup

Copy `.env.example` to `.env` (already created):

```bash
cp .env.example .env
```

To run with **PostgreSQL via Docker Compose**:
```bash
docker compose up -d
```
Ensure `DATABASE_URL=postgresql+asyncpg://disaster_user:disaster_pass@localhost:5432/disaster_db` in `.env`.

To run with **Zero-Config SQLite**:
Ensure `DATABASE_URL=sqlite+aiosqlite:///./disaster.db` in `.env`.

### 2. Backend Setup & Run

```bash
cd backend
python -m pip install -e .
# or install requirements:
python -m pip install -r pyproject.toml

# Run database migrations (or seed directly):
python -m alembic upgrade head

# Seed initial demo users, teams, and sample incidents:
python -m app.seed

# Start the FastAPI server on port 8000:
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend interactive API documentation:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Frontend Setup & Run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Running Automated Tests

Run the full async test suite (tests auth, registration, validation, incident lifecycle, team assignments, and status transitions):

```bash
python -m pytest backend/tests -v
```

---

## Cloud Readiness & AWS Stubs

All AWS service touchpoints are isolated in `backend/app/aws_services.py` with explicit comments for AWS deployment:
- **Amazon S3**: File upload and presigned URL generation for emergency site photos (`upload_file_to_s3`, `get_presigned_url`).
- **Amazon SQS**: Decoupled message queue for async triage, geocoding, and background dispatch (`enqueue_incident_processing`).
- **Amazon SNS**: Push notification topics for status change alerts to citizens and teams (`notify_status_change`).
- **AWS Lambda**: Serverless AI triage and classification (`invoke_triage_lambda`).
