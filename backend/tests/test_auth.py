"""
Authentication & authorisation tests.

Covers:
  - Register: citizen-only, role field ignored from client, name required,
    password strength policy (>=8 chars, uppercase or digit)
  - Login: success, wrong password, non-existent email, JWT structure
  - GET /auth/me: valid token, invalid token, missing token
  - Rate limiting: 5th attempt still works, 6th gets 429
  - require_roles / require_role dependency enforcement
"""

import pytest
from httpx import AsyncClient

from tests.conftest import async_session_test
from app.models import User, RoleEnum
from app.auth import create_access_token, hash_password

pytestmark = pytest.mark.asyncio



# ── Helpers ───────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register(client: AsyncClient, *, name="Test User", email="test@example.com",
                    password="Test1234") -> int:
    """Register and return the new user ID."""
    r = await client.post("/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _login(client: AsyncClient, email="test@example.com", password="Test1234") -> str:
    r = await client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _make_user(role: RoleEnum, name: str, email: str) -> str:
    """Directly insert a user with the given role and return a valid JWT."""
    async with async_session_test() as session:
        u = User(name=name, email=email, password_hash=hash_password("Admin1234"), role=role)
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return create_access_token({"sub": str(u.id), "role": u.role.value})


# ── Register ──────────────────────────────────────────────────────


async def test_register_creates_citizen(client: AsyncClient):
    """Successful registration always yields role=citizen."""
    r = await client.post("/auth/register", json={
        "name": "Alice Sharma", "email": "alice@example.com", "password": "Alice123",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["role"] == "citizen"
    assert data["email"] == "alice@example.com"
    assert "password_hash" not in data  # never leaked


async def test_register_ignores_role_from_client(client: AsyncClient):
    """Even if client sends role=admin it must be ignored; result is citizen."""
    r = await client.post("/auth/register", json={
        "name": "Evil Admin", "email": "evil@example.com",
        "password": "Evil1234", "role": "admin",
    })
    assert r.status_code == 201
    assert r.json()["role"] == "citizen"


async def test_register_duplicate_email_returns_400(client: AsyncClient):
    await _register(client, email="dup@example.com")
    r = await client.post("/auth/register", json={
        "name": "Dup", "email": "dup@example.com", "password": "Dup12345",
    })
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"].lower()


async def test_register_name_required(client: AsyncClient):
    """Omitting both name and full_name must fail with 422."""
    r = await client.post("/auth/register", json={
        "email": "noname@example.com", "password": "NoName12",
    })
    assert r.status_code == 422


async def test_register_full_name_alias_accepted(client: AsyncClient):
    """Sending full_name instead of name must also work."""
    r = await client.post("/auth/register", json={
        "full_name": "Full Name User", "email": "fullname@example.com", "password": "Full1234",
    })
    assert r.status_code == 201
    assert r.json()["full_name"] == "Full Name User"


# ── Password strength ─────────────────────────────────────────────


@pytest.mark.parametrize("password,reason", [
    ("short1",   "too short (<8)"),
    ("alllower", "no digit or uppercase"),
    ("1234567",  "too short and no uppercase"),
])
async def test_register_weak_password_rejected(client: AsyncClient, password: str, reason: str):
    r = await client.post("/auth/register", json={
        "name": "Weak", "email": f"weak_{password[:5]}@example.com", "password": password,
    })
    assert r.status_code == 422, f"Expected 422 for {reason}, got {r.status_code}"


@pytest.mark.parametrize("password", ["Abcdefgh", "abcdefg1", "ABCDEFG1", "abc12345"])
async def test_register_strong_password_accepted(client: AsyncClient, password: str):
    r = await client.post("/auth/register", json={
        "name": "Strong", "email": f"strong_{password}@example.com", "password": password,
    })
    assert r.status_code == 201, f"Expected 201 for {password!r}: {r.text}"


# ── Login ─────────────────────────────────────────────────────────


async def test_login_success_returns_bearer_token(client: AsyncClient):
    await _register(client, email="login_ok@example.com", password="Login123")
    r = await client.post("/auth/login", json={"email": "login_ok@example.com", "password": "Login123"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password_returns_401(client: AsyncClient):
    await _register(client, email="wrong_pw@example.com", password="Right123")
    r = await client.post("/auth/login", json={"email": "wrong_pw@example.com", "password": "WrongPw1"})
    assert r.status_code == 401
    assert "invalid" in r.json()["detail"].lower()


async def test_login_unknown_email_returns_401(client: AsyncClient):
    r = await client.post("/auth/login", json={"email": "ghost@example.com", "password": "Ghost123"})
    assert r.status_code == 401


# ── /auth/me ──────────────────────────────────────────────────────


async def test_me_returns_current_user(client: AsyncClient):
    await _register(client, name="Me User", email="me@example.com", password="Me123456")
    token = await _login(client, "me@example.com", "Me123456")
    r = await client.get("/auth/me", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "me@example.com"
    assert data["role"] == "citizen"
    assert data.get("full_name") or data.get("name")


async def test_me_without_token_returns_401(client: AsyncClient):
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_me_with_invalid_token_returns_401(client: AsyncClient):
    r = await client.get("/auth/me", headers={"Authorization": "Bearer not.a.valid.jwt"})
    assert r.status_code == 401


# ── Rate limiting ─────────────────────────────────────────────────


async def test_login_rate_limit_blocks_after_5_failures(client: AsyncClient):
    """After 5 failed attempts from the same IP the 6th must be 429."""
    email = "ratelimit@example.com"
    await _register(client, email=email, password="Rate1234")

    for i in range(1, 6):
        r = await client.post("/auth/login", json={"email": email, "password": "WrongPwd1"})
        assert r.status_code == 401, f"Attempt {i} should be 401, got {r.status_code}"

    r = await client.post("/auth/login", json={"email": email, "password": "Rate1234"})
    assert r.status_code == 429
    assert "too many" in r.json()["detail"].lower()


# ── require_roles / require_role enforcement ──────────────────────


async def test_citizen_cannot_list_all_incidents(client: AsyncClient):
    """GET /incidents (admin only) must return 403 for citizen."""
    await _register(client, email="cit_rbac@example.com", password="Cit12345")
    token = await _login(client, "cit_rbac@example.com", "Cit12345")
    r = await client.get("/incidents", headers=_auth(token))
    assert r.status_code == 403


async def test_admin_can_list_incidents(client: AsyncClient):
    admin_token = await _make_user(RoleEnum.admin, "RBAC Admin", "rbac_admin@example.com")
    r = await client.get("/incidents", headers=_auth(admin_token))
    assert r.status_code == 200


async def test_only_admin_can_list_all_incidents(client: AsyncClient):
    admin_token = await _make_user(RoleEnum.admin, "RBAC Admin", "rbac_admin_list@example.com")
    r = await client.get("/incidents", headers=_auth(admin_token))
    assert r.status_code == 200


async def test_citizen_cannot_update_priority(client: AsyncClient):
    """Citizens must never be able to set incident priority."""
    await _register(client, email="cit_prio@example.com", password="Cit12345")
    token = await _login(client, "cit_prio@example.com", "Cit12345")

    inc = await client.post("/incidents", json={
        "category": "rescue",
        "description": "Test flood in Kothrud sector 3, need evacuation boats immediately.",
        "location_text": "Kothrud, Pune",
        "people_affected": 5,
    }, headers=_auth(token))
    assert inc.status_code == 201
    incident_id = inc.json()["id"]

    r = await client.patch(
        f"/incidents/{incident_id}/priority",
        json={"priority": "critical"},
        headers=_auth(token),
    )
    assert r.status_code == 403


async def test_citizen_cannot_update_status(client: AsyncClient):
    """Citizens must never be able to set incident status."""
    await _register(client, email="cit_stat@example.com", password="Cit12345")
    token = await _login(client, "cit_stat@example.com", "Cit12345")

    inc = await client.post("/incidents", json={
        "category": "medical",
        "description": "Elderly person collapsed at Shivajinagar bus stand, needs ambulance urgently.",
        "location_text": "Shivajinagar, Pune",
        "people_affected": 1,
    }, headers=_auth(token))
    assert inc.status_code == 201
    incident_id = inc.json()["id"]

    r = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "resolved", "note": "Self-resolved"},
        headers=_auth(token),
    )
    assert r.status_code == 403
