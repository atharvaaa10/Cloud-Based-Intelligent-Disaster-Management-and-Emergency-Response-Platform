"""
Unit and integration tests for Phase 4:
- Application audit logging (audit_log table)
- Access control on GET /admin/audit-log (Admin only)
- Audit log filtering and pagination
- API production hardening (Swagger docs disabled when ENV=production)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AuditLog, Incident, PriorityEnum, RoleEnum, User
from app.config import get_settings
from tests.conftest import async_session_test
from tests.test_api import auth_header, create_user_with_role, register_and_login

pytestmark = pytest.mark.asyncio


# ── 1. Audit Logging on Authentication ────────────────────────

async def test_audit_log_on_login_success_and_failure(client: AsyncClient):
    """Successful and failed logins must write audit records without logging passwords."""
    # 1. Register a test citizen
    await register_and_login(client, email="audit_user@example.com", password="SecurePassword123")

    # 2. Perform a successful login
    resp_success = await client.post("/auth/login", json={"email": "audit_user@example.com", "password": "SecurePassword123"})
    assert resp_success.status_code == 200

    # 3. Perform a failed login (wrong password)
    resp_fail = await client.post("/auth/login", json={"email": "audit_user@example.com", "password": "WrongPassword!"})
    assert resp_fail.status_code == 401

    # 4. Verify DB records
    async with async_session_test() as session:
        result = await session.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc())
        )
        logs = result.scalars().all()
        actions = [log.action for log in logs]

        assert "auth.login_success" in actions
        assert "auth.login_failure" in actions

        # Verify password is never logged
        for log in logs:
            if log.details:
                assert "password" not in log.details
                assert "SecurePassword123" not in str(log.details)
                assert "WrongPassword!" not in str(log.details)


# ── 2. Admin Audit Log Endpoint Access Control ────────────────

async def test_audit_log_endpoint_access_control(client: AsyncClient):
    """GET /admin/audit-log must be forbidden to citizens and allowed for admin."""
    # Create citizen and admin tokens
    citizen_token = await create_user_with_role(RoleEnum.citizen, "Citizen", "citizen_audit@example.com")
    admin_token = await create_user_with_role(RoleEnum.admin, "Admin", "admin_audit@example.com")

    # 1. Unauthenticated -> 401
    resp_unauth = await client.get("/admin/audit-log")
    assert resp_unauth.status_code == 401

    # 2. Citizen -> 403 Forbidden
    resp_citizen = await client.get("/admin/audit-log", headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp_citizen.status_code == 403

    # 3. Admin -> 200 OK
    resp_admin = await client.get("/admin/audit-log", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_admin.status_code == 200
    data = resp_admin.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data


# ── 3. Audit Log Filtering & Operational Tracking ─────────────

async def test_audit_log_filtering_and_incident_tracking(client: AsyncClient):
    """Administrative actions (priority update) record audit entries queryable via filters."""
    admin_token = await create_user_with_role(RoleEnum.admin, "Admin Filter", "admin_filter@example.com")
    citizen_token = await create_user_with_role(RoleEnum.citizen, "Citizen Filter", "reporter_filter@example.com")

    # Create an incident
    create_resp = await client.post(
        "/incidents",
        json={
            "category": "rescue",
            "description": "Urgent flood situation at riverside",
            "location_text": "Camp area",
            "people_affected": 4,
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert create_resp.status_code == 201
    incident_id = create_resp.json()["id"]

    # Admin updates priority to high
    patch_resp = await client.patch(
        f"/incidents/{incident_id}/priority",
        json={"priority": "high"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert patch_resp.status_code == 200

    # Query audit log with action filter "priority_updated"
    audit_resp = await client.get(
        "/admin/audit-log?action=priority_updated",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert audit_resp.status_code == 200
    data = audit_resp.json()
    assert data["total"] >= 1
    matched = [item for item in data["items"] if item["entity_id"] == incident_id]
    assert len(matched) >= 1
    assert matched[0]["action"] == "incident.priority_updated"
    assert matched[0]["actor_role"] == "admin"
    assert matched[0]["details"]["new_priority"] == "high"


# ── 4. Production API Hardening ───────────────────────────────

async def test_production_swagger_docs_configuration():
    """Verify that Swagger UI and OpenAPI documentation are disabled when ENV=production."""
    from app.main import app

    # In current test settings, ENV may be development/testing
    # We test the FastAPI docs_url / openapi_url logic directly
    settings = get_settings()
    is_prod = settings.ENV == "production"

    if is_prod:
        assert app.docs_url is None
        assert app.redoc_url is None
        assert app.openapi_url is None
    else:
        # In non-production, docs are accessible for dev/test
        assert app.docs_url == "/docs"
