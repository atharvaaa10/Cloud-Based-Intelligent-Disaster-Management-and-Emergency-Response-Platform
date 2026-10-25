"""
Tests for 'My Requests' citizen endpoints:
- GET /incidents/mine (paginated, filtering by status & category, search by ID / public_code)
- GET /incidents/{id} access control (owner can view, admin can view, other citizen gets 403)
- POST /incidents/{id}/cancel (enforced: only while status == 'reported'; other citizen gets 403)
- POST /incidents/{id}/note (enforced: citizen can only add note while status == 'reported')
"""

import pytest
from httpx import AsyncClient

from app.models import Incident, RoleEnum, StatusEnum
from tests.test_api import auth_header, create_user_with_role, register_and_login

pytestmark = pytest.mark.asyncio

BASE_INCIDENT = {
    "category": "rescue",
    "description": "Trapped in flood waters near riverside road.",
    "location_text": "Kothrud area, Pune",
    "latitude": 18.5074,
    "longitude": 73.8077,
    "people_affected": 2,
}


# ── 1. GET /incidents/mine (Pagination, Filtering, Search) ───────────────────

async def test_my_incidents_pagination_and_isolation(client: AsyncClient):
    """GET /incidents/mine returns only current user's incidents and supports pagination."""
    token1 = await register_and_login(client, "Citizen One", "citizen_one@test.com", "Secret123")
    token2 = await register_and_login(client, "Citizen Two", "citizen_two@test.com", "Secret123")

    # Create 3 incidents for Citizen 1
    for i in range(3):
        res = await client.post(
            "/incidents",
            json={**BASE_INCIDENT, "description": f"Citizen 1 emergency report number {i+1}."},
            headers=auth_header(token1),
        )
        assert res.status_code == 201

    # Create 1 incident for Citizen 2
    res2 = await client.post(
        "/incidents",
        json={**BASE_INCIDENT, "description": "Citizen 2 emergency report."},
        headers=auth_header(token2),
    )
    assert res2.status_code == 201

    # Citizen 1 requests paginated page 1 with limit 2
    resp = await client.get("/incidents/mine?page=1&limit=2", headers=auth_header(token1))
    assert resp.status_code == 200
    data = resp.json()

    assert "items" in data
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["limit"] == 2
    assert data["pages"] == 2
    assert len(data["items"]) == 2
    # Verify Citizen 2's report is NOT present
    for item in data["items"]:
        assert "Citizen 2" not in item["description"]

    # Citizen 1 requests page 2
    resp_p2 = await client.get("/incidents/mine?page=2&limit=2", headers=auth_header(token1))
    assert resp_p2.status_code == 200
    data_p2 = resp_p2.json()
    assert len(data_p2["items"]) == 1


async def test_my_incidents_filtering_by_status_and_category(client: AsyncClient):
    """GET /incidents/mine filters by status and category."""
    token = await register_and_login(client, "Filter User", "filter_user@test.com", "Secret123")

    # 1. Create rescue incident (reported)
    r1 = await client.post(
        "/incidents",
        json={**BASE_INCIDENT, "category": "rescue", "description": "Rescue request description"},
        headers=auth_header(token),
    )
    assert r1.status_code == 201

    # 2. Create medical incident (reported)
    r2 = await client.post(
        "/incidents",
        json={**BASE_INCIDENT, "category": "medical", "description": "Medical request description"},
        headers=auth_header(token),
    )
    assert r2.status_code == 201

    # Filter by category=medical
    res_cat = await client.get("/incidents/mine?page=1&category=medical", headers=auth_header(token))
    assert res_cat.status_code == 200
    data_cat = res_cat.json()
    assert data_cat["total"] == 1
    assert data_cat["items"][0]["category"] == "medical"

    # Filter by non-matching category=shelter
    res_empty = await client.get("/incidents/mine?page=1&category=shelter", headers=auth_header(token))
    assert res_empty.status_code == 200
    assert res_empty.json()["total"] == 0


async def test_my_incidents_search_by_id(client: AsyncClient):
    """GET /incidents/mine searches by ID or public_code."""
    token = await register_and_login(client, "Search User", "search_user@test.com", "Secret123")

    # Create incident
    res = await client.post("/incidents", json=BASE_INCIDENT, headers=auth_header(token))
    created = res.json()
    inc_id = created["id"]
    public_code = created["public_code"]

    # Search by numeric ID
    res_search_id = await client.get(f"/incidents/mine?page=1&search={inc_id}", headers=auth_header(token))
    assert res_search_id.status_code == 200
    assert res_search_id.json()["total"] == 1
    assert res_search_id.json()["items"][0]["id"] == inc_id

    # Search by public_code
    res_search_code = await client.get(f"/incidents/mine?page=1&search={public_code}", headers=auth_header(token))
    assert res_search_code.status_code == 200
    assert res_search_code.json()["total"] == 1
    assert res_search_code.json()["items"][0]["public_code"] == public_code


# ── 2. GET /incidents/{id} Access Control ────────────────────────────────────

async def test_get_incident_detail_owner_and_rbac(client: AsyncClient):
    """Only the owner (or admin) can see incident detail; other citizens get 403."""
    owner_token = await register_and_login(client, "Owner User", "owner_detail@test.com", "Secret123")
    other_token = await register_and_login(client, "Other User", "other_detail@test.com", "Secret123")
    admin_token = await create_user_with_role(RoleEnum.admin, "Admin Detail", "admin_detail@test.com")

    # Create incident
    res = await client.post("/incidents", json=BASE_INCIDENT, headers=auth_header(owner_token))
    incident_id = res.json()["id"]

    # 1. Owner can see it -> 200
    owner_view = await client.get(f"/incidents/{incident_id}", headers=auth_header(owner_token))
    assert owner_view.status_code == 200
    detail = owner_view.json()
    assert detail["id"] == incident_id
    assert "status_history" in detail

    # 2. Admin can see it -> 200
    admin_view = await client.get(f"/incidents/{incident_id}", headers=auth_header(admin_token))
    assert admin_view.status_code == 200

    # 3. Other citizen gets 403 Forbidden
    other_view = await client.get(f"/incidents/{incident_id}", headers=auth_header(other_token))
    assert other_view.status_code == 403


# ── 3. POST /incidents/{id}/cancel Rule Enforcement ──────────────────────────

async def test_cancel_incident_rule_enforcement(client: AsyncClient):
    """
    Cancellation is allowed ONLY while status == 'reported'.
    Once status is updated (e.g. by admin to in_progress), cancellation returns 400.
    Other citizens get 403.
    """
    owner_token = await register_and_login(client, "Cancel Owner", "cancel_owner@test.com", "Secret123")
    other_token = await register_and_login(client, "Cancel Other", "cancel_other@test.com", "Secret123")
    admin_token = await create_user_with_role(RoleEnum.admin, "Cancel Admin", "cancel_admin@test.com")

    # 1. Create incident (starts in 'reported' status)
    res = await client.post("/incidents", json=BASE_INCIDENT, headers=auth_header(owner_token))
    incident_id = res.json()["id"]

    # Other citizen cannot cancel -> 403
    other_cancel = await client.post(
        f"/incidents/{incident_id}/cancel",
        json={"reason": "Unauthorized attempt"},
        headers=auth_header(other_token),
    )
    assert other_cancel.status_code == 403

    # Admin advances status to 'under_review' or 'assigned'
    status_res = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "in_progress", "note": "Team in transit"},
        headers=auth_header(admin_token),
    )
    assert status_res.status_code == 200

    # Owner attempts to cancel when in_progress -> 400 Bad Request
    blocked_cancel = await client.post(
        f"/incidents/{incident_id}/cancel",
        json={"reason": "Too late"},
        headers=auth_header(owner_token),
    )
    assert blocked_cancel.status_code == 400
    assert "reported" in blocked_cancel.json()["detail"].lower()

    # Create second incident in 'reported' status and cancel successfully
    res2 = await client.post("/incidents", json=BASE_INCIDENT, headers=auth_header(owner_token))
    inc2_id = res2.json()["id"]

    success_cancel = await client.post(
        f"/incidents/{inc2_id}/cancel",
        json={"reason": "Family evacuated safely by neighbors"},
        headers=auth_header(owner_token),
    )
    assert success_cancel.status_code == 200
    assert success_cancel.json()["status"] == "cancelled"

    # Detail shows cancelled status and status_history note
    detail_res = await client.get(f"/incidents/{inc2_id}", headers=auth_header(owner_token))
    detail = detail_res.json()
    assert detail["status"] == "cancelled"
    notes = [h["note"] for h in detail["status_history"] if h["note"]]
    assert any("Family evacuated safely" in n for n in notes)


# ── 4. POST /incidents/{id}/note Rule Enforcement ────────────────────────────

async def test_add_note_rule_enforcement(client: AsyncClient):
    """
    Citizens can add notes ONLY while status == 'reported'.
    Once status progresses, adding a note returns 400.
    Other citizens get 403.
    """
    owner_token = await register_and_login(client, "Note Owner", "note_owner@test.com", "Secret123")
    other_token = await register_and_login(client, "Note Other", "note_other@test.com", "Secret123")
    admin_token = await create_user_with_role(RoleEnum.admin, "Note Admin", "note_admin@test.com")

    # Create incident
    res = await client.post("/incidents", json=BASE_INCIDENT, headers=auth_header(owner_token))
    incident_id = res.json()["id"]

    # 1. Other citizen cannot add note -> 403
    other_note = await client.post(
        f"/incidents/{incident_id}/note",
        json={"note": "Intruder note"},
        headers=auth_header(other_token),
    )
    assert other_note.status_code == 403

    # 2. Owner adds note while 'reported' -> 200
    note_res = await client.post(
        f"/incidents/{incident_id}/note",
        json={"note": "Water has risen 2 feet, elderly citizen on roof."},
        headers=auth_header(owner_token),
    )
    assert note_res.status_code == 200
    assert "Citizen Note" in note_res.json()["note"] or "Water has risen" in note_res.json()["note"]

    # Verify note in incident detail timeline
    detail = (await client.get(f"/incidents/{incident_id}", headers=auth_header(owner_token))).json()
    assert any("Water has risen 2 feet" in (h["note"] or "") for h in detail["status_history"])

    # 3. Admin advances status to 'assigned'
    await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "assigned", "note": "Dispatch team 1"},
        headers=auth_header(admin_token),
    )

    # 4. Owner tries to add note now -> 400 Bad Request
    blocked_note = await client.post(
        f"/incidents/{incident_id}/note",
        json={"note": "Another update"},
        headers=auth_header(owner_token),
    )
    assert blocked_note.status_code == 400
    assert "reported" in blocked_note.json()["detail"].lower()
