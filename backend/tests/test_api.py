"""
Tests for auth, incident creation, and assignment flow.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────

async def register_user(client: AsyncClient, name="Test", email="test@test.com", password="test123"):
    return await client.post("/auth/register", json={"name": name, "email": email, "password": password})


async def login_user(client: AsyncClient, email="test@test.com", password="test123"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


async def register_and_login(client: AsyncClient, name="Test", email="test@test.com", password="test123"):
    await register_user(client, name, email, password)
    return await login_user(client, email, password)


def auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


# ── Auth Tests ────────────────────────────────────────────────

async def test_register_success(client: AsyncClient):
    resp = await register_user(client, "Alice", "alice@test.com", "alice123")
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "alice@test.com"
    assert data["role"] == "citizen"


async def test_register_duplicate_email(client: AsyncClient):
    await register_user(client, "Bob", "bob@test.com", "bob12345")
    resp = await register_user(client, "Bob2", "bob@test.com", "bob12345")
    assert resp.status_code == 400


async def test_login_success(client: AsyncClient):
    await register_user(client, "Carol", "carol@test.com", "carol123")
    resp = await client.post("/auth/login", json={"email": "carol@test.com", "password": "carol123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_login_wrong_password(client: AsyncClient):
    await register_user(client, "Dave", "dave@test.com", "dave1234")
    resp = await client.post("/auth/login", json={"email": "dave@test.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_me_endpoint(client: AsyncClient):
    token = await register_and_login(client, "Eve", "eve@test.com", "eve12345")
    resp = await client.get("/auth/me", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "eve@test.com"


# ── Incident Tests ────────────────────────────────────────────

INCIDENT_PAYLOAD = {
    "category": "rescue",
    "description": "Flooding in test area, need urgent rescue boats.",
    "location_text": "Test Area, Pune",
    "people_affected": 10,
}


async def test_create_incident(client: AsyncClient):
    token = await register_and_login(client, "Reporter", "reporter@test.com", "rep12345")
    resp = await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(token))
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "rescue"
    assert data["status"] == "reported"


async def test_my_incidents(client: AsyncClient):
    token = await register_and_login(client, "Reporter2", "reporter2@test.com", "rep12345")
    await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(token))
    resp = await client.get("/incidents/mine", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_citizen_cannot_list_all(client: AsyncClient):
    token = await register_and_login(client, "Citizen", "citizen2@test.com", "cit12345")
    resp = await client.get("/incidents", headers=auth_header(token))
    assert resp.status_code == 403


# ── Assignment Tests (requires admin) ─────────────────────────

async def test_create_incident_requires_auth(client: AsyncClient):
    resp = await client.post("/incidents", json=INCIDENT_PAYLOAD)
    assert resp.status_code == 401


# ── Assignment & Status Flow Tests ───────────────────────────

from tests.conftest import async_session_test
from app.models import User, RoleEnum
from app.auth import create_access_token, hash_password


async def create_user_with_role(role: RoleEnum, name: str, email: str) -> str:
    async with async_session_test() as session:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password("password123"),
            role=role,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return create_access_token({"sub": str(user.id), "role": user.role.value})


async def test_admin_assigns_team_and_flow(client: AsyncClient):
    # 1. Prepare roles
    admin_token = await create_user_with_role(RoleEnum.admin, "Admin", "admin_flow@test.com")
    responder_token = await create_user_with_role(RoleEnum.responder, "Responder", "resp_flow@test.com")
    citizen_token = await register_and_login(client, "Citizen User", "citizen_flow@test.com", "cit12345")

    # 2. Admin creates a rescue team
    team_resp = await client.post(
        "/teams",
        json={"name": "Alpha Rescue Squad", "type": "rescue", "contact": "+91-9876543210", "is_available": True},
        headers=auth_header(admin_token),
    )
    assert team_resp.status_code == 201
    team_id = team_resp.json()["id"]
    assert team_resp.json()["is_available"] is True

    # 3. Citizen reports an emergency
    inc_resp = await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(citizen_token))
    assert inc_resp.status_code == 201
    incident_id = inc_resp.json()["id"]
    assert inc_resp.json()["status"] == "reported"

    # 4. Citizen cannot assign team (requires admin)
    forbidden_assign = await client.post(
        f"/incidents/{incident_id}/assign",
        json={"team_id": team_id},
        headers=auth_header(citizen_token),
    )
    assert forbidden_assign.status_code == 403

    # 5. Admin assigns the team
    assign_resp = await client.post(
        f"/incidents/{incident_id}/assign",
        json={"team_id": team_id},
        headers=auth_header(admin_token),
    )
    assert assign_resp.status_code == 201

    # Verify team is now marked unavailable
    team_check = await client.get(f"/teams/{team_id}", headers=auth_header(admin_token))
    assert team_check.status_code == 200
    assert team_check.json()["is_available"] is False

    # 6. Responder moves status to in_progress
    progress_resp = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "in_progress", "note": "Team deployed on site"},
        headers=auth_header(responder_token),
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["status"] == "in_progress"

    # 7. Responder resolves incident -> team freed
    resolve_resp = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "resolved", "note": "All citizens safely evacuated"},
        headers=auth_header(responder_token),
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "resolved"

    team_freed = await client.get(f"/teams/{team_id}", headers=auth_header(admin_token))
    assert team_freed.json()["is_available"] is True

    # 8. Citizen views their incident detail with full history timeline
    detail_resp = await client.get(f"/incidents/{incident_id}", headers=auth_header(citizen_token))
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "resolved"
    assert len(detail["status_history"]) >= 2
    assert len(detail["assignments"]) == 1
