"""
Tests for Admin Combined Rescue Teams & Resources:
- GET /admin/resources/summary
- Teams CRUD & PATCH
- Vehicles CRUD & PATCH
- Supplies CRUD & PATCH (stock level quick update)
- Shelters CRUD & PATCH (occupancy & availability)
- POST /admin/incidents/{id}/resources (atomic transaction, stock decrement, teams/vehicles busy)
- POST /admin/incidents/{id}/resources/release (frees teams and vehicles)
- Audit log rows recorded for each mutation
- RBAC protection (401 unauth, 403 citizen)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import (
    RoleEnum,
    Incident,
    StatusEnum,
    PriorityEnum,
    CategoryEnum,
    ResponseTeam,
    TeamStatusEnum,
    Vehicle,
    VehicleStatusEnum,
    Supply,
    SupplyCategoryEnum,
    Place,
    PlaceTypeEnum,
    AuditLog,
)
from app.auth import create_access_token, hash_password
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_admin_token(email: str = "admin.resources@disaster.io") -> str:
    from app.models import User
    async with async_session_test() as session:
        admin = User(
            full_name="Resource Ops Admin",
            name="Resource Ops Admin",
            email=email,
            phone="+91 91111 22222",
            password_hash="dummy_hash_to_avoid_slow_bcrypt",
            role=RoleEnum.admin,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        return create_access_token({"sub": str(admin.id), "role": "admin"})


async def _create_citizen_token(email: str = "cit.resources@test.com") -> str:
    from app.models import User
    async with async_session_test() as session:
        cit = User(
            full_name="Citizen Worker",
            name="Citizen Worker",
            email=email,
            phone="+91 93333 44444",
            password_hash="dummy_hash_to_avoid_slow_bcrypt",
            role=RoleEnum.citizen,
        )
        session.add(cit)
        await session.commit()
        await session.refresh(cit)
        return create_access_token({"sub": str(cit.id), "role": "citizen"})


async def test_admin_resources_rbac(client: AsyncClient):
    """Admin resources endpoints require admin privileges."""
    endpoints = [
        "/admin/resources/summary",
        "/admin/resources/teams",
        "/admin/resources/vehicles",
        "/admin/resources/supplies",
        "/admin/resources/shelters",
    ]

    # 1. Unauthenticated (401)
    for ep in endpoints:
        resp = await client.get(ep)
        assert resp.status_code == 401, f"{ep} did not return 401 for unauth"

    # 2. Citizen user (403)
    cit_token = await _create_citizen_token()
    for ep in endpoints:
        resp = await client.get(ep, headers=auth_header(cit_token))
        assert resp.status_code == 403, f"{ep} did not return 403 for citizen"


async def test_admin_resources_summary_and_crud(client: AsyncClient):
    """Verify CRUD and summary calculations for teams, vehicles, supplies, shelters."""
    admin_token = await _create_admin_token()
    headers = auth_header(admin_token)

    # 1. Create a Team
    team_payload = {
        "name": "Kothrud Rapid Delta Team",
        "contact": "+91 20 2544 9900",
        "members_count": 8,
        "latitude": 18.5085,
        "longitude": 73.8062,
        "status": "available",
    }
    t_res = await client.post("/admin/resources/teams", json=team_payload, headers=headers)
    assert t_res.status_code == 201
    team_data = t_res.json()
    team_id = team_data["id"]
    assert team_data["name"] == team_payload["name"]
    assert team_data["members_count"] == 8

    # Patch team
    patch_t = await client.patch(f"/admin/resources/teams/{team_id}", json={"status": "busy"}, headers=headers)
    assert patch_t.status_code == 200
    assert patch_t.json()["status"] == "busy"

    # 2. Create a Vehicle
    veh_payload = {
        "name": "Baner Rescue Van 1",
        "type": "supply_truck",
        "plate": "MH-12-TEST-001",
        "status": "available",
        "assigned_team_id": team_id,
    }
    v_res = await client.post("/admin/resources/vehicles", json=veh_payload, headers=headers)
    assert v_res.status_code == 201
    veh_id = v_res.json()["id"]

    # Patch vehicle status
    patch_v = await client.patch(f"/admin/resources/vehicles/{veh_id}", json={"status": "in_use"}, headers=headers)
    assert patch_v.status_code == 200
    assert patch_v.json()["status"] == "in_use"

    # 3. Create a Supply
    sup_payload = {
        "item": "First Aid Medical Pouches",
        "category": "medical",
        "quantity": 15,
        "unit": "pouches",
        "low_stock_threshold": 20,
        "location": "Swargate Relief Depot",
    }
    s_res = await client.post("/admin/resources/supplies", json=sup_payload, headers=headers)
    assert s_res.status_code == 201
    sup_id = s_res.json()["id"]
    assert s_res.json()["is_low_stock"] is True  # 15 <= 20

    # Quick stock adjustment (+10 delta)
    patch_s = await client.patch(f"/admin/resources/supplies/{sup_id}", json={"delta": 10}, headers=headers)
    assert patch_s.status_code == 200
    assert patch_s.json()["quantity"] == 25
    assert patch_s.json()["is_low_stock"] is False  # 25 > 20

    # 4. Create a Shelter
    shelter_payload = {
        "name": "Aundh Disaster Relief Community Center",
        "address": "DP Road, Aundh, Pune",
        "latitude": 18.5595,
        "longitude": 73.8020,
        "capacity": 200,
        "current_occupancy": 80,
        "available": True,
        "contact": "+91 20 2588 1234",
    }
    sh_res = await client.post("/admin/resources/shelters", json=shelter_payload, headers=headers)
    assert sh_res.status_code == 201
    shelter_id = sh_res.json()["id"]
    assert sh_res.json()["free_beds"] == 120
    assert sh_res.json()["occupancy_pct"] == 40.0

    # Patch shelter occupancy
    patch_sh = await client.patch(f"/admin/resources/shelters/{shelter_id}", json={"current_occupancy": 150}, headers=headers)
    assert patch_sh.status_code == 200
    assert patch_sh.json()["free_beds"] == 50
    assert patch_sh.json()["occupancy_pct"] == 75.0

    # 5. Check Summary Strip
    summary_res = await client.get("/admin/resources/summary", headers=headers)
    assert summary_res.status_code == 200
    sum_data = summary_res.json()
    assert sum_data["vehicles_in_use"] == 1
    assert sum_data["free_shelter_beds"] == 50
    assert sum_data["total_teams"] >= 1
    assert sum_data["total_vehicles"] >= 1


async def test_admin_incident_assign_and_release_resources(client: AsyncClient):
    """POST /admin/incidents/{id}/resources assigns team, vehicle, supplies in 1 tx and releases them."""
    admin_token = await _create_admin_token("admin.deploy@disaster.io")
    headers = auth_header(admin_token)

    # 1. Setup Incident, Team, Vehicle, Supply
    async with async_session_test() as session:
        inc = Incident(
            category=CategoryEnum.rescue,
            description="Structural collapse requiring search & rescue equipment",
            location_text="Sinhagad Road, Pune",
            address="Near Anand Nagar, Sinhagad Road",
            people_affected=5,
            priority=PriorityEnum.high,
            status=StatusEnum.reported,
        )
        session.add(inc)

        team = ResponseTeam(
            name="Sinhagad Rescue Task Force",
            status=TeamStatusEnum.available,
            contact="+91 20 2435 9999",
            members_count=10,
        )
        session.add(team)

        veh = Vehicle(
            name="Inflatable Life Raft Unit 1",
            type="boat",
            plate="MH-12-BOAT-99",
            status=VehicleStatusEnum.available,
        )
        session.add(veh)

        sup = Supply(
            item="Emergency Drinking Water Bottles",
            category=SupplyCategoryEnum.water,
            quantity=100,
            unit="bottles",
            low_stock_threshold=20,
            location="Sinhagad Depot",
        )
        session.add(sup)

        await session.commit()
        inc_id = inc.id
        team_id = team.id
        veh_id = veh.id
        sup_id = sup.id

    # 2. Test Insufficient stock error
    fail_payload = {
        "team_id": team_id,
        "vehicle_ids": [veh_id],
        "supplies": [{"supply_id": sup_id, "quantity": 150}],  # Only 100 in stock!
    }
    fail_res = await client.post(f"/admin/incidents/{inc_id}/resources", json=fail_payload, headers=headers)
    assert fail_res.status_code == 400
    assert "Insufficient stock" in fail_res.json()["detail"]

    # 3. Successful Assignment
    success_payload = {
        "team_id": team_id,
        "vehicle_ids": [veh_id],
        "supplies": [{"supply_id": sup_id, "quantity": 40}],
    }
    assign_res = await client.post(f"/admin/incidents/{inc_id}/resources", json=success_payload, headers=headers)
    assert assign_res.status_code == 200
    data = assign_res.json()
    assert data["incident_id"] == inc_id
    assert data["incident_status"] == "assigned"
    assert data["assigned_team_id"] == team_id
    assert veh_id in data["assigned_vehicle_ids"]

    # Verify Database state
    async with async_session_test() as session:
        t_check = (await session.execute(select(ResponseTeam).where(ResponseTeam.id == team_id))).scalar_one()
        assert t_check.status == TeamStatusEnum.busy
        assert t_check.current_incident_id == inc_id

        v_check = (await session.execute(select(Vehicle).where(Vehicle.id == veh_id))).scalar_one()
        assert v_check.status == VehicleStatusEnum.in_use
        assert v_check.current_incident_id == inc_id

        s_check = (await session.execute(select(Supply).where(Supply.id == sup_id))).scalar_one()
        assert s_check.quantity == 60  # 100 - 40 = 60

        # Verify Audit Log
        audit_res = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "incident.resources_assigned",
                AuditLog.entity_id == inc_id,
            )
        )
        audit_row = audit_res.scalar_one_or_none()
        assert audit_row is not None
        assert audit_row.details["team_id"] == team_id

    # 4. Release Endpoint
    release_res = await client.post(f"/admin/incidents/{inc_id}/resources/release", headers=headers)
    assert release_res.status_code == 200
    rel_data = release_res.json()
    assert rel_data["freed_teams"] == 1
    assert rel_data["freed_vehicles"] == 1

    # Verify team and vehicle are freed
    async with async_session_test() as session:
        t_freed = (await session.execute(select(ResponseTeam).where(ResponseTeam.id == team_id))).scalar_one()
        assert t_freed.status == TeamStatusEnum.available
        assert t_freed.current_incident_id is None

        v_freed = (await session.execute(select(Vehicle).where(Vehicle.id == veh_id))).scalar_one()
        assert v_freed.status == VehicleStatusEnum.available
        assert v_freed.current_incident_id is None

        # Verify Release Audit Log
        rel_audit = (await session.execute(
            select(AuditLog).where(
                AuditLog.action == "incident.resources_released",
                AuditLog.entity_id == inc_id,
            )
        )).scalar_one_or_none()
        assert rel_audit is not None
