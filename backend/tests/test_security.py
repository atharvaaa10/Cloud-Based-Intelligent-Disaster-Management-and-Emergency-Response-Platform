"""
Security tests for the citizen portal.

Covers:
1. Ownership enforcement — a citizen cannot access another user's incident
2. Role enforcement   — a citizen cannot set priority (admin-only endpoint)
3. Upload validation  — .exe / application/octet-stream must be rejected
4. Photo ownership    — a citizen cannot get a photo URL for another user's incident
5. Notification ownership — a citizen cannot mark another user's notification read
6. Cancel ownership   — a citizen cannot cancel another user's incident
7. Note ownership     — a citizen cannot add a note to another user's incident
8. Presign content-type rejection — must reject non-image MIME types
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

# ── Helpers ────────────────────────────────────────────────────────────────────

CITIZEN1 = {"email": "alice@test.com", "full_name": "Alice Test", "password": "Citizen1@"}
CITIZEN2 = {"email": "bob@test.com",   "full_name": "Bob Test",   "password": "Citizen2@"}
ADMIN    = {"email": "admin@test.com", "full_name": "Admin User",  "password": "Admin1@23", "role": "admin"}

INCIDENT_BODY = {
    "category": "rescue",
    "description": "Security test incident that is long enough to pass validation",
    "address": "123 Test Street, Pune",
    "location_text": "123 Test Street, Pune",
    "people_affected": 1,
    "latitude": 18.52,
    "longitude": 73.85,
}


async def register(client, user_data):
    r = await client.post("/auth/register", json=user_data)
    return r


async def login(client, email, password):
    r = await client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


async def create_incident(client, token):
    r = await client.post(
        "/incidents",
        json=INCIDENT_BODY,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, f"Incident creation failed: {r.text}"
    return r.json()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def two_citizens(client: AsyncClient):
    """Register two separate citizen accounts and return their tokens."""
    await register(client, CITIZEN1)
    await register(client, CITIZEN2)
    token1 = await login(client, CITIZEN1["email"], CITIZEN1["password"])
    token2 = await login(client, CITIZEN2["email"], CITIZEN2["password"])
    return token1, token2


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient):
    """Register an admin and return their token.
    We use the internal endpoint to elevate, since registration always creates citizens."""
    await register(client, ADMIN)
    # Elevate via direct DB for test — use internal patch to role
    from tests.conftest import async_session_test
    from sqlalchemy import select, update
    from app.models import User
    async with async_session_test() as session:
        await session.execute(
            update(User)
            .where(User.email == ADMIN["email"])
            .values(role="admin")
        )
        await session.commit()
    return await login(client, ADMIN["email"], ADMIN["password"])


# ═══════════════════════════════════════════════════════════════════════════════
# 1. OWNERSHIP: citizen cannot read another citizen's incident
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_read_other_incident(client: AsyncClient, two_citizens):
    """GET /incidents/{id} must return 403 when requested by a non-owner citizen."""
    token1, token2 = two_citizens

    # Alice creates an incident
    incident = await create_incident(client, token1)
    incident_id = incident["id"]

    # Bob tries to read Alice's incident — must be 403
    r = await client.get(
        f"/incidents/{incident_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. OWNERSHIP: citizen cannot cancel another citizen's incident
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_cancel_other_incident(client: AsyncClient, two_citizens):
    """POST /incidents/{id}/cancel must return 403 for non-owner citizen."""
    token1, token2 = two_citizens

    incident = await create_incident(client, token1)

    r = await client.post(
        f"/incidents/{incident['id']}/cancel",
        json={},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. OWNERSHIP: citizen cannot add a note to another citizen's incident
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_note_other_incident(client: AsyncClient, two_citizens):
    """POST /incidents/{id}/note must return 403 for non-owner citizen."""
    token1, token2 = two_citizens

    incident = await create_incident(client, token1)

    r = await client.post(
        f"/incidents/{incident['id']}/note",
        json={"note": "Injected note from attacker"},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. ROLE: citizen cannot set priority (admin-only)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_set_priority(client: AsyncClient, two_citizens):
    """PATCH /incidents/{id}/priority must return 403 for a citizen."""
    token1, _ = two_citizens

    incident = await create_incident(client, token1)

    r = await client.patch(
        f"/incidents/{incident['id']}/priority",
        json={"priority": "critical"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. ROLE: citizen cannot update status (admin only)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_update_status(client: AsyncClient, two_citizens):
    """PATCH /incidents/{id}/status must return 403 for a citizen."""
    token1, _ = two_citizens

    incident = await create_incident(client, token1)

    r = await client.patch(
        f"/incidents/{incident['id']}/status",
        json={"status": "resolved", "note": "Fake resolve by citizen"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. ROLE: citizen cannot assign a team
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citizen_cannot_assign_team(client: AsyncClient, two_citizens):
    """POST /incidents/{id}/assign must return 403 for a citizen."""
    token1, _ = two_citizens

    incident = await create_incident(client, token1)

    r = await client.post(
        f"/incidents/{incident['id']}/assign",
        json={"team_id": 1},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. UPLOAD: application/octet-stream (.exe) must be rejected at presign
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_upload_exe_rejected_at_presign(client: AsyncClient, two_citizens):
    """POST /uploads/presign must return 400 for application/octet-stream."""
    token1, _ = two_citizens

    r = await client.post(
        "/uploads/presign",
        json={"content_type": "application/octet-stream"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    assert "Unsupported" in r.text or "unsupported" in r.text.lower(), r.text


@pytest.mark.asyncio
async def test_upload_exe_mimetype_rejected_at_presign(client: AsyncClient, two_citizens):
    """POST /uploads/presign must return 400 for application/x-msdownload."""
    token1, _ = two_citizens

    r = await client.post(
        "/uploads/presign",
        json={"content_type": "application/x-msdownload"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


@pytest.mark.asyncio
async def test_upload_text_mimetype_rejected(client: AsyncClient, two_citizens):
    """POST /uploads/presign must return 400 for text/plain."""
    token1, _ = two_citizens

    r = await client.post(
        "/uploads/presign",
        json={"content_type": "text/plain"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. UPLOAD: old incidents router photo-upload-url also enforces ownership
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_photo_upload_url_ownership(client: AsyncClient, two_citizens):
    """POST /incidents/{id}/photo-upload-url must return 403 for non-owner citizen."""
    token1, token2 = two_citizens

    incident = await create_incident(client, token1)

    r = await client.post(
        f"/incidents/{incident['id']}/photo-upload-url",
        json={"content_type": "image/jpeg"},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 9. UPLOAD: photo download URL enforces ownership
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_photo_download_url_ownership(client: AsyncClient, two_citizens):
    """GET /incidents/{id}/photo-url must return 403 for non-owner citizen."""
    token1, token2 = two_citizens

    incident = await create_incident(client, token1)

    r = await client.get(
        f"/incidents/{incident['id']}/photo-url",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code in (403, 404), (
        f"Expected 403 or 404 (no photo), got {r.status_code}: {r.text}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 10. NOTIFICATION: citizen cannot mark another user's notification as read
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_notification_ownership(client: AsyncClient, two_citizens):
    """PATCH /notifications/{id}/read must return 404 for non-owner (leaks no info)."""
    token1, token2 = two_citizens

    # Create an incident for Alice to trigger a notification
    await create_incident(client, token1)

    # Get Alice's notifications
    r = await client.get(
        "/notifications",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 200
    notifications = r.json()

    if not notifications:
        pytest.skip("No notifications seeded — skipping ownership check")

    notif_id = notifications[0]["id"]

    # Bob tries to mark Alice's notification as read — must be 404 (not 200)
    r = await client.patch(
        f"/notifications/{notif_id}/read",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 11. CANCEL STATUS GATE: cannot cancel an already-cancelled incident
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cannot_cancel_already_cancelled(client: AsyncClient, two_citizens):
    """POST /incidents/{id}/cancel a second time must return 400."""
    token1, _ = two_citizens

    incident = await create_incident(client, token1)
    inc_id = incident["id"]

    # First cancel succeeds
    r1 = await client.post(
        f"/incidents/{inc_id}/cancel",
        json={},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r1.status_code == 200, r1.text

    # Second cancel must fail with 400
    r2 = await client.post(
        f"/incidents/{inc_id}/cancel",
        json={},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r2.status_code == 400, f"Expected 400 (already cancelled), got {r2.status_code}: {r2.text}"


# ═══════════════════════════════════════════════════════════════════════════════
# 12. UNAUTHENTICATED: protected endpoints reject missing token
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_incidents_mine_requires_auth(client: AsyncClient):
    """GET /incidents/mine without token must return 401."""
    r = await client.get("/incidents/mine")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


@pytest.mark.asyncio
async def test_notifications_requires_auth(client: AsyncClient):
    """GET /notifications without token must return 401."""
    r = await client.get("/notifications")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


@pytest.mark.asyncio
async def test_citizen_overview_requires_auth(client: AsyncClient):
    """GET /citizen/overview without token must return 401."""
    r = await client.get("/citizen/overview")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


# ═══════════════════════════════════════════════════════════════════════════════
# 13. ALLOWED UPLOADS: valid JPEG presign must succeed
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_valid_jpeg_presign_succeeds(client: AsyncClient, two_citizens):
    """POST /uploads/presign with image/jpeg must return 200."""
    token1, _ = two_citizens

    r = await client.post(
        "/uploads/presign",
        json={"content_type": "image/jpeg"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "photo_key" in data
    assert "upload_url" in data


@pytest.mark.asyncio
async def test_valid_webp_presign_succeeds(client: AsyncClient, two_citizens):
    """POST /uploads/presign with image/webp must return 200."""
    token1, _ = two_citizens

    r = await client.post(
        "/uploads/presign",
        json={"content_type": "image/webp"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
