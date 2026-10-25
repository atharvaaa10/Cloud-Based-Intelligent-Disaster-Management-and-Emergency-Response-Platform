"""
Tests for Public Live Map endpoint (GET /map/public):
- Public accessibility (no auth required)
- Approximate coordinates (~500m rounding)
- Omission of sensitive details (no description, photo_key, reporter_id)
- Bounding box spatial filtering
- Places and affected zones inclusion
"""

import pytest
from httpx import AsyncClient

from app.models import Incident, Place, PlaceTypeEnum, RoleEnum, StatusEnum, CategoryEnum, PriorityEnum
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def test_get_public_map_data(client: AsyncClient):
    """GET /map/public returns approximate incidents, places, and affected zones."""
    # Seed an incident with exact coordinates
    token = await register_and_login(client, "Test Map User", "map_user@test.com", "Password123")
    res = await client.post(
        "/incidents",
        json={
            "category": "rescue",
            "description": "Sensitive emergency details: Family of 4 stranded on roof.",
            "location_text": "Near Kothrud Stand, Paud Road, Kothrud, Pune",
            "latitude": 18.5074,
            "longitude": 73.8077,
            "people_affected": 4,
        },
        headers=auth_header(token),
    )
    assert res.status_code == 201

    # Seed places into test DB
    async with async_session_test() as db:
        shelter = Place(
            type=PlaceTypeEnum.shelter,
            name="Kothrud Shelter Hub",
            latitude=18.5065,
            longitude=73.8082,
            address="Paud Road, Kothrud, Pune",
            capacity=300,
            available=True,
            contact="+91 20 2543 8901",
        )
        hospital = Place(
            type=PlaceTypeEnum.hospital,
            name="Sahyadri Hospital",
            latitude=18.5042,
            longitude=73.8145,
            address="Karve Road, Pune",
            capacity=150,
            available=True,
            contact="+91 20 6721 3000",
        )
        db.add_all([shelter, hospital])
        await db.commit()

    # Call public map endpoint
    resp = await client.get("/map/public")
    assert resp.status_code == 200
    data = resp.json()

    assert "incidents" in data
    assert "places" in data
    assert "affected_zones" in data

    # 1. Verify incident privacy rules
    incidents = data["incidents"]
    assert len(incidents) >= 1
    target = incidents[0]
    assert "public_code" in target
    assert "category" in target
    assert "approx_latitude" in target
    assert "approx_longitude" in target
    assert "general_area" in target

    # Sensitive fields MUST NOT be present
    assert "description" not in target
    assert "photo_key" not in target
    assert "reporter_id" not in target
    assert "reporter_name" not in target
    assert "phone" not in target

    # Check coordinate rounding to ~500m (0.005 step)
    # 18.5074 rounded to nearest 0.005 is 18.505
    assert abs(target["approx_latitude"] - 18.5074) <= 0.005
    assert abs(target["approx_longitude"] - 73.8077) <= 0.005

    # 2. Verify places
    places = data["places"]
    assert len(places) >= 2
    place_types = [p["type"] for p in places]
    assert "shelter" in place_types
    assert "hospital" in place_types

    # 3. Verify affected zones
    zones = data["affected_zones"]
    assert len(zones) >= 1
    assert any("Mutha" in z["name"] or "River" in z["name"] for z in zones)


async def test_get_public_map_bbox_filtering(client: AsyncClient):
    """GET /map/public supports bbox filtering (min_lon,min_lat,max_lon,max_lat)."""
    # Seed 2 incidents in different areas (Hinjawadi vs Kothrud)
    async with async_session_test() as db:
        inc1 = Incident(
            public_code="DR-BBOX1",
            tracking_code="TRK-BB01",
            reporter_id=1,
            category=CategoryEnum.rescue,
            description="Hinjawadi incident",
            address="Hinjawadi Phase 1, Pune",
            location_text="Hinjawadi Phase 1, Pune",
            latitude=18.5930,
            longitude=73.7360,
            people_affected=3,
            priority=PriorityEnum.high,
            status=StatusEnum.reported,
        )
        inc2 = Incident(
            public_code="DR-BBOX2",
            tracking_code="TRK-BB02",
            reporter_id=1,
            category=CategoryEnum.medical,
            description="Kothrud incident",
            address="Kothrud, Pune",
            location_text="Kothrud, Pune",
            latitude=18.5050,
            longitude=73.8100,
            people_affected=1,
            priority=PriorityEnum.medium,
            status=StatusEnum.reported,
        )
        db.add_all([inc1, inc2])
        await db.commit()

    # Query with Hinjawadi bbox: lon 73.70 to 73.76, lat 18.57 to 18.61
    resp = await client.get("/map/public?bbox=73.70,18.57,73.76,18.61")
    assert resp.status_code == 200
    data = resp.json()

    codes = [i["public_code"] for i in data["incidents"]]
    assert "DR-BBOX1" in codes
    assert "DR-BBOX2" not in codes
