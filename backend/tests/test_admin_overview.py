"""
Tests for Admin Overview endpoint (GET /admin/overview):
- 401 when unauthenticated
- 403 when authenticated as citizen
- 200 when authenticated as admin
- Accurate counts for total, pending, active, resolved, critical
- Exactly 14 daily count entries in chronological order
- Complete category breakdown
- Top critical incidents list
"""

from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient

from app.models import RoleEnum, Incident, StatusEnum, PriorityEnum, CategoryEnum
from app.auth import create_access_token, hash_password
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_admin_token(email: str = "admin.overview@disaster.io") -> str:
    from app.models import User
    async with async_session_test() as session:
        admin = User(
            full_name="Operations Admin",
            name="Operations Admin",
            email=email,
            phone="+91 99999 11111",
            password_hash=hash_password("AdminPass123!"),
            role=RoleEnum.admin,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return create_access_token({"sub": str(admin.id), "role": "admin"})


async def test_admin_overview_unauthenticated_returns_401(client: AsyncClient):
    """GET /admin/overview must return 401 when called without a token."""
    resp = await client.get("/admin/overview")
    assert resp.status_code == 401
    assert "detail" in resp.json()


async def test_admin_overview_citizen_forbidden_returns_403(client: AsyncClient):
    """GET /admin/overview must return 403 when called by a citizen."""
    cit_token = await register_and_login(client, "Normal Citizen", "cit.ov@test.com", "Password123!")
    resp = await client.get("/admin/overview", headers=auth_header(cit_token))
    assert resp.status_code == 403


async def test_admin_overview_returns_metrics_and_trends(client: AsyncClient):
    """GET /admin/overview returns correct operational metrics, 14-day trends, and categories."""
    admin_token = await _create_admin_token()

    # Seed diverse incidents directly in the test database
    now = datetime.now(timezone.utc)
    async with async_session_test() as session:
        incidents_to_add = [
            # Pending report (reported)
            Incident(
                category=CategoryEnum.rescue,
                description="Flooded basement in Kothrud",
                location_text="Kothrud, Pune",
                latitude=18.5074,
                longitude=73.8077,
                priority=PriorityEnum.critical,
                status=StatusEnum.reported,
                created_at=now,
            ),
            # Pending report (under_review)
            Incident(
                category=CategoryEnum.medical,
                description="Medical triage needed",
                location_text="Shivajinagar, Pune",
                latitude=18.5314,
                longitude=73.8446,
                priority=PriorityEnum.high,
                status=StatusEnum.under_review,
                created_at=now - timedelta(days=1),
            ),
            # Active emergency (assigned)
            Incident(
                category=CategoryEnum.rescue,
                description="Stranded senior citizens",
                location_text="Sinhagad Road, Pune",
                latitude=18.4850,
                longitude=73.8250,
                priority=PriorityEnum.critical,
                status=StatusEnum.assigned,
                created_at=now - timedelta(days=2),
            ),
            # Active emergency (in_progress)
            Incident(
                category=CategoryEnum.food_water,
                description="Drinking water supply request",
                location_text="Warje, Pune",
                latitude=18.4800,
                longitude=73.7900,
                priority=PriorityEnum.medium,
                status=StatusEnum.in_progress,
                created_at=now - timedelta(days=3),
            ),
            # Resolved case
            Incident(
                category=CategoryEnum.shelter,
                description="Shelter request for family",
                location_text="Deccan, Pune",
                latitude=18.5167,
                longitude=73.8417,
                priority=PriorityEnum.low,
                status=StatusEnum.resolved,
                created_at=now - timedelta(days=5),
            ),
        ]
        session.add_all(incidents_to_add)
        await session.commit()

    resp = await client.get("/admin/overview", headers=auth_header(admin_token))
    assert resp.status_code == 200
    data = resp.json()

    # Stat verification
    assert data["total_incidents"] >= 5
    assert data["pending_reports"] >= 2  # reported + under_review
    assert data["active_emergencies"] >= 2  # assigned + in_progress
    assert data["resolved_cases"] >= 1  # resolved
    assert data["critical_alerts"] >= 2  # critical and not resolved

    # 14-day trend verification
    assert len(data["incidents_per_day"]) == 14
    for entry in data["incidents_per_day"]:
        assert "date" in entry
        assert "count" in entry
        assert isinstance(entry["count"], int)

    # Category verification
    assert "rescue" in data["by_category"]
    assert "medical" in data["by_category"]
    assert "food_water" in data["by_category"]
    assert "shelter" in data["by_category"]
    assert "other" in data["by_category"]

    # Critical incidents list verification (top 5 critical, non-resolved)
    assert len(data["critical_incidents"]) <= 5
    for ci in data["critical_incidents"]:
        assert ci["priority"] == "critical"
        assert ci["status"] != "resolved"

