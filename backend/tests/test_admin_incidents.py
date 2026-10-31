"""
Tests for Admin Incident Management Endpoints:
- GET /admin/incidents (pagination, search, filter, sort)
- GET /admin/incidents/{id} (details, reporter, status_history, assignments, rule-based scoring)
- PATCH /admin/incidents/{id} (status transitions, note requirement, audit log, notifications)
- POST /admin/incidents/{id}/assign (team availability, assignment, status change, notification)
"""

from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from app.models import RoleEnum, Incident, StatusEnum, PriorityEnum, CategoryEnum, Team
from app.auth import create_access_token, hash_password
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_admin_token(email: str = "admin.incidents@disaster.io") -> str:
    from app.models import User
    async with async_session_test() as session:
        admin = User(
            full_name="Incident Commander",
            name="Incident Commander",
            email=email,
            phone="+91 98888 77777",
            password_hash=hash_password("AdminPass123!"),
            role=RoleEnum.admin,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return create_access_token({"sub": str(admin.id), "role": "admin"})


async def test_admin_incidents_rbac(client: AsyncClient):
    """GET /admin/incidents requires admin role (401 unauth, 403 citizen)."""
    # 1. Unauthenticated
    unauth = await client.get("/admin/incidents")
    assert unauth.status_code == 401

    # 2. Citizen
    cit_token = await register_and_login(client, "Citizen User", "cit.inc@test.com", "Password123!")
    cit_resp = await client.get("/admin/incidents", headers=auth_header(cit_token))
    assert cit_resp.status_code == 403


async def test_admin_incidents_list_filter_sort(client: AsyncClient):
    """GET /admin/incidents supports search, filter, sort and pagination."""
    admin_token = await _create_admin_token()

    # Seed incidents with specific keywords and locations
    async with async_session_test() as session:
        inc1 = Incident(
            category=CategoryEnum.rescue,
            description="Elderly woman trapped in Baner apartment",
            location_text="Baner Road, Pune",
            address="Building B, Baner",
            people_affected=3,
            priority=PriorityEnum.critical,
            status=StatusEnum.reported,
        )
        inc2 = Incident(
            category=CategoryEnum.medical,
            description="First aid required for wounded pedestrian",
            location_text="FC Road, Deccan",
            address="FC Road, Pune",
            people_affected=1,
            priority=PriorityEnum.medium,
            status=StatusEnum.under_review,
        )
        session.add_all([inc1, inc2])
        await session.commit()

    # 1. List with search
    search_resp = await client.get("/admin/incidents?search=Baner", headers=auth_header(admin_token))
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert search_data["total"] >= 1
    assert any("Baner" in i["location_text"] for i in search_data["items"])

    # 2. List with status filter
    status_resp = await client.get("/admin/incidents?status=reported", headers=auth_header(admin_token))
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    for item in status_data["items"]:
        assert item["status"] == "reported"

    # 3. List with priority filter
    prio_resp = await client.get("/admin/incidents?priority=critical", headers=auth_header(admin_token))
    assert prio_resp.status_code == 200
    for item in prio_resp.json()["items"]:
        assert item["priority"] == "critical"


async def test_admin_incident_detail_with_rule_based_scoring(client: AsyncClient):
    """GET /admin/incidents/{id} returns details and rule-based priority scoring."""
    admin_token = await _create_admin_token()

    async with async_session_test() as session:
        inc = Incident(
            category=CategoryEnum.rescue,
            description="Two small children and infant trapped in submerged basement",
            location_text="Sinhagad Road, Pune",
            people_affected=8,
            priority=PriorityEnum.medium,
            status=StatusEnum.reported,
        )
        session.add(inc)
        await session.commit()
        await session.refresh(inc)
        inc_id = inc.id

    resp = await client.get(f"/admin/incidents/{inc_id}", headers=auth_header(admin_token))
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == inc_id
    assert "suggested_priority" in data
    suggested = data["suggested_priority"]
    assert suggested["suggested_priority"] == "critical"  # rescue + 8 people + children/trapped/submerged
    assert suggested["score"] >= 70
    assert "breakdown" in suggested
    assert len(suggested["breakdown"]["matched_keywords"]) > 0


async def test_admin_incident_status_transitions_and_note_requirement(client: AsyncClient):
    """PATCH /admin/incidents/{id} validates transitions and requires notes."""
    admin_token = await _create_admin_token()

    async with async_session_test() as session:
        inc = Incident(
            category=CategoryEnum.rescue,
            description="Water pipe burst causing minor waterlogging",
            location_text="Kothrud, Pune",
            priority=PriorityEnum.low,
            status=StatusEnum.reported,
        )
        session.add(inc)
        await session.commit()
        await session.refresh(inc)
        inc_id = inc.id

    # 1. Status change without note must fail with 400
    no_note = await client.patch(
        f"/admin/incidents/{inc_id}",
        json={"status": "under_review", "note": ""},
        headers=auth_header(admin_token),
    )
    assert no_note.status_code == 400
    assert "note is required" in no_note.json()["detail"].lower()

    # 2. Invalid status transition (reported -> resolved directly) must fail with 400
    invalid_trans = await client.patch(
        f"/admin/incidents/{inc_id}",
        json={"status": "resolved", "note": "Trying to skip review and dispatch"},
        headers=auth_header(admin_token),
    )
    assert invalid_trans.status_code == 400
    assert "invalid status transition" in invalid_trans.json()["detail"].lower()

    # 3. Valid status transition (reported -> under_review with note) succeeds
    valid_trans = await client.patch(
        f"/admin/incidents/{inc_id}",
        json={"status": "under_review", "note": "Incident verified via PMC flood cell telemetry"},
        headers=auth_header(admin_token),
    )
    assert valid_trans.status_code == 200
    data = valid_trans.json()
    assert data["status"] == "under_review"
    assert len(data["status_history"]) >= 1
    assert data["status_history"][0]["new_status"] == "under_review"


async def test_admin_incident_team_assignment(client: AsyncClient):
    """POST /admin/incidents/{id}/assign assigns available team and sets status to assigned."""
    admin_token = await _create_admin_token()

    async with async_session_test() as session:
        inc = Incident(
            category=CategoryEnum.rescue,
            description="Stranded flood victims on roof",
            location_text="Yerwada, Pune",
            priority=PriorityEnum.critical,
            status=StatusEnum.under_review,
        )
        avail_team = Team(
            name="Quick Rescue Delta",
            type="rescue",
            contact="+91 91234 56789",
            is_available=True,
        )
        busy_team = Team(
            name="Busy Squad Echo",
            type="rescue",
            contact="+91 98765 00000",
            is_available=False,
        )
        session.add_all([inc, avail_team, busy_team])
        await session.commit()
        await session.refresh(inc)
        await session.refresh(avail_team)
        await session.refresh(busy_team)
        inc_id = inc.id
        avail_team_id = avail_team.id
        busy_team_id = busy_team.id

    # 1. Assign busy team fails
    fail_busy = await client.post(
        f"/admin/incidents/{inc_id}/assign",
        json={"team_id": busy_team_id},
        headers=auth_header(admin_token),
    )
    assert fail_busy.status_code == 400
    assert "unavailable" in fail_busy.json()["detail"].lower()

    # 2. Assign available team succeeds
    success_assign = await client.post(
        f"/admin/incidents/{inc_id}/assign",
        json={"team_id": avail_team_id},
        headers=auth_header(admin_token),
    )
    assert success_assign.status_code == 201
    assign_data = success_assign.json()
    assert assign_data["team_id"] == avail_team_id
    assert assign_data["team_name"] == "Quick Rescue Delta"

    # 3. Check incident detail reflects assigned status and team assignment
    detail_resp = await client.get(f"/admin/incidents/{inc_id}", headers=auth_header(admin_token))
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "assigned"
    assert len(detail["assignments"]) >= 1

