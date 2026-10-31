import pytest
from httpx import AsyncClient
from app.models import (
    Incident,
    User,
    RoleEnum,
    CategoryEnum,
    PriorityEnum,
    StatusEnum,
    Place,
    PlaceTypeEnum,
    ResponseTeam,
    TeamStatusEnum,
)
from app.auth import create_access_token, hash_password
from tests.conftest import async_session_test


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_admin_map_rbac(client: AsyncClient):
    # 1. Unauthenticated gets 401
    res = await client.get("/admin/map")
    assert res.status_code == 401

    # 2. Create citizen & admin
    async with async_session_test() as session:
        citizen = User(
            email="citizen_map_rbac@example.com",
            name="Map Citizen",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.citizen,
        )
        admin = User(
            email="admin_map_rbac@example.com",
            name="Map Admin",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.admin,
        )
        session.add_all([citizen, admin])
        await session.commit()
        await session.refresh(citizen)
        await session.refresh(admin)

        cit_token = create_access_token({"sub": str(citizen.id), "role": "citizen"})
        adm_token = create_access_token({"sub": str(admin.id), "role": "admin"})

    # 3. Citizen gets 403
    cit_res = await client.get("/admin/map", headers=auth_header(cit_token))
    assert cit_res.status_code == 403

    # 4. Admin gets 200
    adm_res = await client.get("/admin/map", headers=auth_header(adm_token))
    assert adm_res.status_code == 200
    data = adm_res.json()
    assert "incidents" in data
    assert "shelters" in data
    assert "hospitals" in data
    assert "supplies" in data
    assert "response_teams" in data
    assert "affected_zones" in data


@pytest.mark.anyio
async def test_admin_map_exact_coordinates_and_details(client: AsyncClient):
    precise_lat = 18.5204321
    precise_lon = 73.8567432

    async with async_session_test() as session:
        admin = User(
            email="admin_map_exact@example.com",
            name="Admin Exact",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.admin,
        )
        citizen = User(
            email="citizen_reporter_map@example.com",
            name="Reporter Citizen",
            phone="+919876543210",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.citizen,
        )
        session.add_all([admin, citizen])
        await session.commit()
        await session.refresh(admin)
        await session.refresh(citizen)

        inc = Incident(
            reporter_id=citizen.id,
            category=CategoryEnum.rescue,
            description="Trapped elderly resident on 2nd floor",
            address="123 Laxmi Road, Pune",
            latitude=precise_lat,
            longitude=precise_lon,
            priority=PriorityEnum.critical,
            status=StatusEnum.reported,
            people_affected=3,
            public_code="INC-MAP-EXACT",
            tracking_code="TRK-MAP-EXACT",
        )
        shelter = Place(
            type=PlaceTypeEnum.shelter,
            name="Shivaji Nagar Relief Camp",
            latitude=18.5300,
            longitude=73.8500,
            address="Shivaji Nagar, Pune",
            capacity=200,
            available=True,
        )
        hospital = Place(
            type=PlaceTypeEnum.hospital,
            name="Sassoon General Hospital",
            latitude=18.5250,
            longitude=73.8750,
            address="Near Pune Station",
            capacity=500,
            available=True,
        )
        supply = Place(
            type=PlaceTypeEnum.relief_supply,
            name="Central Food & Water Stockpile",
            latitude=18.5150,
            longitude=73.8600,
            address="Camp, Pune",
            capacity=1000,
            available=True,
        )
        team = ResponseTeam(
            name="Fire & Rescue Squad 1",
            latitude=18.5220,
            longitude=73.8580,
            status=TeamStatusEnum.available,
        )
        session.add_all([inc, shelter, hospital, supply, team])
        await session.commit()
        await session.refresh(inc)

        adm_token = create_access_token({"sub": str(admin.id), "role": "admin"})

    res = await client.get("/admin/map", headers=auth_header(adm_token))
    assert res.status_code == 200
    data = res.json()

    # Find our incident
    matched = [i for i in data["incidents"] if i["id"] == inc.id]
    assert len(matched) == 1
    item = matched[0]

    # Exact coordinates (not rounded to ~500m!)
    assert item["latitude"] == pytest.approx(precise_lat, abs=1e-5)
    assert item["longitude"] == pytest.approx(precise_lon, abs=1e-5)

    # Reporter contact details
    assert item["reporter"] is not None
    assert item["reporter"]["email"] == "citizen_reporter_map@example.com"
    assert item["reporter"]["phone"] == "+919876543210"

    # Places categorization
    assert any(s["name"] == "Shivaji Nagar Relief Camp" for s in data["shelters"])
    assert any(h["name"] == "Sassoon General Hospital" for h in data["hospitals"])
    assert any(r["name"] == "Central Food & Water Stockpile" for r in data["supplies"])

    # Response team exact GPS
    assert any(t["name"] == "Fire & Rescue Squad 1" and t["status"] == "available" for t in data["response_teams"])


@pytest.mark.anyio
async def test_admin_map_filters(client: AsyncClient):
    async with async_session_test() as session:
        admin = User(
            email="admin_map_filt@example.com",
            name="Admin Filter",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.admin,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

        inc1 = Incident(
            category=CategoryEnum.medical,
            description="Medical emergency in area",
            address="Kothrud, Pune",
            priority=PriorityEnum.high,
            status=StatusEnum.assigned,
            latitude=18.51,
            longitude=73.85,
            public_code="INC-F1",
        )
        inc2 = Incident(
            category=CategoryEnum.rescue,
            description="Rescue operation needed",
            address="Baner, Pune",
            priority=PriorityEnum.critical,
            status=StatusEnum.reported,
            latitude=18.52,
            longitude=73.86,
            public_code="INC-F2",
        )
        session.add_all([inc1, inc2])
        await session.commit()
        await session.refresh(inc1)
        await session.refresh(inc2)

        adm_token = create_access_token({"sub": str(admin.id), "role": "admin"})

    # Filter by priority=critical
    res = await client.get("/admin/map?priority=critical", headers=auth_header(adm_token))
    assert res.status_code == 200
    items = res.json()["incidents"]
    assert all(i["priority"] == "critical" for i in items)
    assert any(i["id"] == inc2.id for i in items)

    # Filter by status=assigned
    res2 = await client.get("/admin/map?status=assigned", headers=auth_header(adm_token))
    assert res2.status_code == 200
    items2 = res2.json()["incidents"]
    assert all(i["status"] == "assigned" for i in items2)
    assert any(i["id"] == inc1.id for i in items2)


@pytest.mark.anyio
async def test_mark_as_responding_rbac_and_flow(client: AsyncClient):
    async with async_session_test() as session:
        admin = User(
            email="admin_respond_test@example.com",
            name="Admin Responder",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.admin,
        )
        citizen = User(
            email="citizen_no_respond_test@example.com",
            name="Citizen User",
            password_hash=hash_password("Pass1234!"),
            role=RoleEnum.citizen,
        )
        session.add_all([admin, citizen])
        await session.commit()
        await session.refresh(admin)
        await session.refresh(citizen)

        inc = Incident(
            category=CategoryEnum.rescue,
            description="Trapped person needing rescue",
            address="Shivaji Nagar, Pune",
            priority=PriorityEnum.critical,
            status=StatusEnum.reported,
            latitude=18.50,
            longitude=73.80,
        )
        session.add(inc)
        await session.commit()
        await session.refresh(inc)

        cit_token = create_access_token({"sub": str(citizen.id), "role": "citizen"})
        adm_token = create_access_token({"sub": str(admin.id), "role": "admin"})

    # Citizen cannot mark as responding
    res = await client.post(f"/incidents/{inc.id}/respond", headers=auth_header(cit_token))
    assert res.status_code == 403

    # Admin marks as responding
    res2 = await client.post(f"/incidents/{inc.id}/respond", headers=auth_header(adm_token))
    assert res2.status_code == 200
    assert res2.json()["status"] == "in_progress"
