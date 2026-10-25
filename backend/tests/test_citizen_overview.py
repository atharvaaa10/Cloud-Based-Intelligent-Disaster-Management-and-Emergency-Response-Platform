"""
Tests for Citizen Overview endpoint (GET /citizen/overview):
- Authentication required (401 when unauthenticated)
- User data isolation (only own stats: total, active, resolved; never city-wide)
- Most recent 3 requests with status
- Nearby shelters ordered by proximity (top 3)
- Public announcements & emergency advisories
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Incident, Place, PlaceTypeEnum, StatusEnum
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio

BASE_INCIDENT = {
    "category": "rescue",
    "description": "Urgent assistance needed at waterlogged housing society.",
    "location_text": "Kothrud area, Pune",
    "latitude": 18.5074,
    "longitude": 73.8077,
    "people_affected": 2,
}


async def test_citizen_overview_unauthorized(client: AsyncClient):
    """GET /citizen/overview rejects unauthenticated requests with 401."""
    resp = await client.get("/citizen/overview")
    assert resp.status_code == 401


async def test_citizen_overview_data_isolation_and_stats(client: AsyncClient):
    """GET /citizen/overview returns strictly current user's stats and recent requests."""
    token_alice = await register_and_login(client, "Alice Citizen", "alice.overview@test.com", "Password123")
    token_bob = await register_and_login(client, "Bob Citizen", "bob.overview@test.com", "Password123")

    # Bob reports 2 incidents
    for i in range(2):
        await client.post(
            "/incidents",
            json={**BASE_INCIDENT, "description": f"Bob incident {i+1}."},
            headers=auth_header(token_bob),
        )

    # Alice reports 4 incidents
    alice_inc_ids = []
    for i in range(4):
        res = await client.post(
            "/incidents",
            json={**BASE_INCIDENT, "description": f"Alice incident {i+1}."},
            headers=auth_header(token_alice),
        )
        assert res.status_code == 201
        alice_inc_ids.append(res.json()["id"])

    # Update status for Alice's incidents using the test database session:
    # 0 -> reported (active)
    # 1 -> under_review (active)
    # 2 -> resolved (resolved)
    # 3 -> resolved (resolved)
    async with async_session_test() as db:
        q = select(Incident).where(Incident.id == alice_inc_ids[1])
        inc1 = (await db.execute(q)).scalar_one()
        inc1.status = StatusEnum.under_review

        q = select(Incident).where(Incident.id == alice_inc_ids[2])
        inc2 = (await db.execute(q)).scalar_one()
        inc2.status = StatusEnum.resolved

        q = select(Incident).where(Incident.id == alice_inc_ids[3])
        inc3 = (await db.execute(q)).scalar_one()
        inc3.status = StatusEnum.resolved

        await db.commit()

    # Alice fetches her overview
    resp = await client.get("/citizen/overview", headers=auth_header(token_alice))
    assert resp.status_code == 200
    data = resp.json()

    # Verify user stats strictly reflect Alice's 4 incidents (does not include Bob's 2)
    stats = data["stats"]
    assert stats["total"] == 4
    assert stats["active"] == 2      # reported + under_review
    assert stats["resolved"] == 2    # two resolved

    # Verify recent requests contains at most 3 items belonging to Alice
    recent = data["recent_requests"]
    assert len(recent) == 3
    # All recent requests must belong to Alice
    assert all("Alice incident" in r["description"] for r in recent)

    # Verify announcements present
    assert len(data["announcements"]) >= 1
    first_ann = data["announcements"][0]
    assert "title" in first_ann
    assert "severity" in first_ann
    assert "source" in first_ann


async def test_citizen_overview_shelter_proximity(client: AsyncClient):
    """GET /citizen/overview orders nearby shelters by distance to provided coordinates."""
    token = await register_and_login(client, "Charlie Shelter", "charlie.shelter@test.com", "Password123")

    # Seed 4 shelters into the test database
    async with async_session_test() as db:
        shelters_to_add = [
            Place(
                type=PlaceTypeEnum.shelter,
                name="Hinjawadi IT Park Sports Complex Emergency Shelter",
                latitude=18.5930,
                longitude=73.7360,
                address="Phase 1, Hinjawadi Rajiv Gandhi Infotech Park, Pune",
                capacity=400,
                available=True,
                contact="+91 20 6674 1200",
            ),
            Place(
                type=PlaceTypeEnum.shelter,
                name="Wakad Municipal Primary School Relief Camp",
                latitude=18.5975,
                longitude=73.7650,
                address="Datta Mandir Road, Wakad, Pune",
                capacity=180,
                available=True,
                contact="+91 20 2728 5511",
            ),
            Place(
                type=PlaceTypeEnum.shelter,
                name="Balewadi National Sports Complex Refuge Center",
                latitude=18.5742,
                longitude=73.7725,
                address="Balewadi Stadium Road, Pune",
                capacity=750,
                available=True,
                contact="+91 20 2737 4000",
            ),
            Place(
                type=PlaceTypeEnum.shelter,
                name="Sinhagad Road Community Center & Flood Relief Hub",
                latitude=18.4705,
                longitude=73.8285,
                address="Manik Baug, Sinhagad Road, Pune",
                capacity=350,
                available=True,
                contact="+91 20 2435 6789",
            ),
        ]
        db.add_all(shelters_to_add)
        await db.commit()

    # Pass Hinjawadi coordinates (18.5930, 73.7360)
    resp = await client.get(
        "/citizen/overview?lat=18.5930&lon=73.7360",
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()

    shelters = data["nearby_shelters"]
    assert len(shelters) == 3

    # Shelters must be sorted by distance_km ascending
    distances = [s["distance_km"] for s in shelters]
    assert distances == sorted(distances)

    # First shelter should be Hinjawadi at 0.0 km
    assert "Hinjawadi" in shelters[0]["name"]
    assert shelters[0]["distance_km"] == 0.0
    assert shelters[0]["available"] is True
    assert shelters[0]["capacity"] == 400
