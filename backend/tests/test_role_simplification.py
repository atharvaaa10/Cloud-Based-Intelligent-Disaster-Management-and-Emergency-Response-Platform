"""
Tests for Role Simplification (Two roles: citizen and admin):
- Registration cannot create an admin (even if role=admin is sent in payload)
- Registration rejects unknown/legacy roles (e.g. 'responder', 'volunteer') with 422
- Citizen gets 403 on respond, assign, and teams
- Admin gets 200 on respond, assign, and teams
- Alembic migration upgrade & downgrade verification
"""

import os
import tempfile
import pytest
from httpx import AsyncClient
from alembic import command
from alembic.config import Config

from app.models import RoleEnum, Team, Incident, CategoryEnum, StatusEnum, PriorityEnum
from app.auth import create_access_token, hash_password
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_admin_token(email: str = "superadmin@disaster.io") -> str:
    from app.models import User
    async with async_session_test() as session:
        admin = User(
            full_name="Disaster Admin",
            name="Disaster Admin",
            email=email,
            phone="+91 99999 88888",
            password_hash=hash_password("AdminPass123!"),
            role=RoleEnum.admin,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return create_access_token({"sub": str(admin.id), "role": "admin"})


async def test_registration_always_creates_citizen_and_ignores_role_admin(client: AsyncClient):
    """POST /auth/register with role='admin' must still result in role='citizen'."""
    resp = await client.post(
        "/auth/register",
        json={
            "full_name": "Infiltrator",
            "email": "hacker@test.com",
            "password": "Password123!",
            "role": "admin",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["role"] == "citizen"
    assert data["email"] == "hacker@test.com"


async def test_registration_rejects_unknown_roles_with_422(client: AsyncClient):
    """POST /auth/register with deprecated or invalid role values must return 422 Unprocessable Entity."""
    for bad_role in ["responder", "volunteer", "superhero", "root"]:
        resp = await client.post(
            "/auth/register",
            json={
                "full_name": "Test User",
                "email": f"test_{bad_role}@test.com",
                "password": "Password123!",
                "role": bad_role,
            },
        )
        assert resp.status_code == 422, f"Expected 422 for role '{bad_role}', got {resp.status_code}"


async def test_citizen_forbidden_on_admin_endpoints(client: AsyncClient):
    """Citizen must receive 403 on /incidents/{id}/respond, /incidents/{id}/assign, and /teams."""
    citizen_token = await register_and_login(client, "Regular Citizen", "regular_cit@test.com", "Password123!")

    # 1. Citizen cannot GET /teams
    teams_resp = await client.get("/teams", headers=auth_header(citizen_token))
    assert teams_resp.status_code == 403

    # Create an incident to test respond and assign
    inc_resp = await client.post(
        "/incidents",
        json={
            "category": "rescue",
            "description": "Flash flood stranded elderly couple near riverside.",
            "location_text": "Kothrud, Pune",
            "latitude": 18.50,
            "longitude": 73.81,
        },
        headers=auth_header(citizen_token),
    )
    assert inc_resp.status_code == 201
    inc_id = inc_resp.json()["id"]

    # 2. Citizen cannot POST /incidents/{id}/respond
    respond_resp = await client.post(
        f"/incidents/{inc_id}/respond",
        headers=auth_header(citizen_token),
    )
    assert respond_resp.status_code == 403

    # 3. Citizen cannot POST /incidents/{id}/assign
    assign_resp = await client.post(
        f"/incidents/{inc_id}/assign",
        json={"team_id": 1},
        headers=auth_header(citizen_token),
    )
    assert assign_resp.status_code == 403


async def test_admin_allowed_on_admin_endpoints(client: AsyncClient):
    """Admin must receive 200 on /teams, /incidents/{id}/assign, and /incidents/{id}/respond."""
    admin_token = await _create_admin_token("verified_admin@disaster.io")
    citizen_token = await register_and_login(client, "Citizen Requester", "cit_req@test.com", "Password123!")

    # Seed an available team
    async with async_session_test() as session:
        team = Team(
            name="QRT Unit 10",
            type="rescue",
            contact="+91 20 2222 3333",
            is_available=True,
        )
        session.add(team)
        await session.commit()
        await session.refresh(team)
        team_id = team.id

    # 1. Admin can GET /teams
    teams_resp = await client.get("/teams", headers=auth_header(admin_token))
    assert teams_resp.status_code == 200
    assert any(t["id"] == team_id for t in teams_resp.json())

    # Citizen reports incident
    inc_resp = await client.post(
        "/incidents",
        json={
            "category": "medical",
            "description": "Ambulance required for injured person following structure collapse.",
            "location_text": "Baner, Pune",
            "latitude": 18.55,
            "longitude": 73.78,
        },
        headers=auth_header(citizen_token),
    )
    assert inc_resp.status_code == 201
    inc_id = inc_resp.json()["id"]

    # 2. Admin can POST /incidents/{id}/assign
    assign_resp = await client.post(
        f"/incidents/{inc_id}/assign",
        json={"team_id": team_id},
        headers=auth_header(admin_token),
    )
    assert assign_resp.status_code in (200, 201)
    assert assign_resp.json()["team_id"] == team_id

    # 3. Admin can POST /incidents/{id}/respond
    respond_resp = await client.post(
        f"/incidents/{inc_id}/respond",
        headers=auth_header(admin_token),
    )
    assert respond_resp.status_code == 200
    assert respond_resp.json()["status"] == "in_progress"


async def test_alembic_migrations_upgrade_and_downgrade():
    """Verify that Alembic migrations run upgrade and downgrade cleanly on a fresh SQLite database."""
    import asyncio
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        tmp_db_path = tmp_db.name

    def _run_migrations(db_path: str):
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
        cfg = Config(alembic_ini_path)
        cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_path.replace(os.sep, '/')}")

        # Test upgrade to head
        command.upgrade(cfg, "head")
        # Test downgrade to 0004_pune_schema
        command.downgrade(cfg, "0004_pune_schema")
        # Test re-upgrade to head
        command.upgrade(cfg, "head")

    try:
        await asyncio.to_thread(_run_migrations, tmp_db_path)
    finally:
        if os.path.exists(tmp_db_path):
            try:
                os.remove(tmp_db_path)
            except OSError:
                pass
