# 🛡️ ResQCloud — FastAPI Backend Service

Asynchronous, high-throughput disaster response and emergency management API built for Pune, Maharashtra, India. Powered by **FastAPI**, **SQLAlchemy 2.0 (Async)**, **Alembic**, and **PostgreSQL** (with **SQLite** fallback for zero-dependency local runs).

---

## 🏗️ Architecture & Features

- **Relational ACID Storage**: PostgreSQL 16 / SQLite via SQLAlchemy 2.0 async engine and session factory.
- **Declarative Migrations**: Full revision tracking with Alembic.
- **Role-Based Access Control (RBAC)**: Two application roles (`citizen` and `admin`) secured by signed JWT tokens.
- **Municipal Disaster Triage**: Real-time scoring, emergency dispatching, status tracking, and public reference codes (`DR-XXXX`).
- **Observability & Health Checks**: Unauthenticated `/health` endpoint for load balancers and container orchestrators.
- **CORS Configured**: Pre-configured for Vite React SPA (`http://localhost:5173`).

---

## 🗄️ Database Tables

| Table | Key Fields | Description |
| :--- | :--- | :--- |
| **`users`** | `id`, `full_name`, `email` (unique), `phone`, `password_hash`, `role` (`citizen` \| `volunteer` \| `responder` \| `admin`), `created_at` | Platform accounts with bcrypt hashes |
| **`incidents`** | `id`, `public_code` (`DR-XXXX`, unique), `tracking_code`, `reporter_id` (nullable), `category` (`rescue` \| `medical` \| `food_water` \| `shelter` \| `other`), `description`, `address`, `latitude`, `longitude`, `people_affected`, `photo_key` (nullable), `priority` (`pending` \| `low` \| `medium` \| `high` \| `critical`), `status` (`reported` \| `under_review` \| `assigned` \| `in_progress` \| `resolved`), `created_at`, `updated_at` | Incident report records and coordinates |
| **`status_history`** | `id`, `incident_id`, `old_status`, `new_status`, `changed_by`, `note`, `created_at` | Immutable audit trail of incident status changes |
| **`notifications`** | `id`, `user_id`, `incident_id` (nullable), `type`, `title`, `message`, `is_read`, `created_at` | Alerts and push notifications for users |
| **`places`** | `id`, `type` (`shelter` \| `hospital` \| `relief_supply`), `name`, `latitude`, `longitude`, `address`, `capacity`, `available` (bool), `contact` | Shelters, hospitals, and supply hubs in Pune |
| **`response_teams`** | `id`, `name`, `latitude`, `longitude`, `status` (`available` \| `busy`) | Field dispatch units and GPS locations |

---

## 🚀 Quick Start Guide

### 1. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL` is set to your PostgreSQL database:

```env
DATABASE_URL=postgresql+asyncpg://disaster_user:disaster_pass@localhost:5432/disaster_db
```

*(For lightweight local testing without PostgreSQL running, you can use: `DATABASE_URL=sqlite+aiosqlite:///./disaster.db`)*

### 2. Install Dependencies

```bash
cd backend
python -m pip install -e .
```

### 3. Run Alembic Migrations

Apply all schema revisions to bring the database to `head`:

```bash
python -m alembic upgrade head
```

### 4. Seed Realistic Pune Data

Populates Pune localities (Kothrud, Hinjawadi, Baner, Wakad, Aundh, Sinhagad Road):
- **25 Incidents** across categories with status histories
- **6 Shelters** with capacities and contact numbers
- **4 Hospitals** with critical emergency contacts
- **8 Response Teams** with live GPS coordinates
- **Demo Accounts** for every role

```bash
python -m app.seed
```

### 5. Launch FastAPI Server

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🌐 Endpoints & API Documentation

- **Swagger UI Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: `GET /health` → [http://localhost:8000/health](http://localhost:8000/health)
- **Incident Reporting & Queue**: `GET /incidents`, `POST /incidents`, `GET /incidents/mine`, `PATCH /incidents/{id}/status`
- **Pune Places (Shelters & Hospitals)**: `GET /places?type=shelter`, `GET /places?type=hospital`
- **Response Teams**: `GET /response-teams`, `PATCH /response-teams/{id}/status`
- **User Notifications**: `GET /notifications`, `PATCH /notifications/{id}/read`

---

## 🔑 Demo Seed Credentials

> Two application roles (citizen, admin). Response teams and shelters are managed resources, not user accounts.

| Role | Email | Password | Phone |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@disaster.io` | `admin123` | +91 98230 11223 |
| **Citizen** | `citizen@disaster.io` | `cit123` | +91 98221 77889 |
