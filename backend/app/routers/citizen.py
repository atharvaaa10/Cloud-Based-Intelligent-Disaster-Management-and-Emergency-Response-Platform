"""
Citizen router — Citizen overview dashboard, personal stats, and public safety data.
"""

from datetime import datetime, timedelta, timezone
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Incident, Place, PlaceTypeEnum, ResponseTeam, StatusEnum, TeamStatusEnum, User
from app.schemas import (
    AnnouncementOut,
    CitizenOverviewOut,
    CitizenStats,
    GlobalStatCardsOut,
    IncidentOut,
    NearbyShelterOut,
)

router = APIRouter(prefix="/citizen", tags=["citizen"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance between two coordinates in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)


# Official public advisories for Pune disaster preparedness & emergency alerts
def get_default_announcements():
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "ann-1",
            "title": "Heavy rainfall expected",
            "message": "IMD has issued an orange alert for Pune district.",
            "severity": "warning",
            "source": "District Disaster Management Authority (DDMA), Pune",
            "issued_at": now - timedelta(hours=2),
            "active": True,
        },
        {
            "id": "ann-2",
            "title": "Shelter capacity updated",
            "message": "Kothrud Relief Shelter now has 50 available slots.",
            "severity": "info",
            "source": "Pune Municipal Corporation",
            "issued_at": now - timedelta(hours=5),
            "active": True,
        },
        {
            "id": "ann-3",
            "title": "System maintenance",
            "message": "The platform will be under maintenance tomorrow from 2 AM to 4 AM.",
            "severity": "low",
            "source": "ResQCloud Operations Team",
            "issued_at": now - timedelta(days=1),
            "active": True,
        },
    ]


@router.get("/overview", response_model=CitizenOverviewOut)
async def get_citizen_overview(
    lat: Optional[float] = Query(None, ge=-90, le=90, description="Citizen latitude"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="Citizen longitude"),
    limit: int = Query(3, ge=1, le=20, description="Max recent requests"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Citizen overview returning strictly the current user's data + public safety information.
    City-wide administrative statistics are not exposed here.
    """
    # ── 1. User's Own Request Statistics ─────────────────────────
    # Total requests
    total_q = select(func.count(Incident.id)).where(Incident.reporter_id == current_user.id)
    total_count = (await db.execute(total_q)).scalar_one()

    # Active requests: reported, under_review, assigned, in_progress
    active_statuses = [
        StatusEnum.reported,
        StatusEnum.under_review,
        StatusEnum.assigned,
        StatusEnum.in_progress,
    ]
    active_q = select(func.count(Incident.id)).where(
        Incident.reporter_id == current_user.id,
        Incident.status.in_(active_statuses),
    )
    active_count = (await db.execute(active_q)).scalar_one()

    # Under review requests
    under_review_q = select(func.count(Incident.id)).where(
        Incident.reporter_id == current_user.id,
        Incident.status == StatusEnum.under_review,
    )
    under_review_count = (await db.execute(under_review_q)).scalar_one()

    # Response in progress requests (in_progress or assigned)
    in_progress_q = select(func.count(Incident.id)).where(
        Incident.reporter_id == current_user.id,
        Incident.status.in_([StatusEnum.in_progress, StatusEnum.assigned]),
    )
    in_progress_count = (await db.execute(in_progress_q)).scalar_one()

    # Resolved requests: resolved
    resolved_q = select(func.count(Incident.id)).where(
        Incident.reporter_id == current_user.id,
        Incident.status == StatusEnum.resolved,
    )
    resolved_count = (await db.execute(resolved_q)).scalar_one()

    stats = CitizenStats(
        total=total_count,
        active=active_count,
        resolved=resolved_count,
        under_review=under_review_count,
        in_progress=in_progress_count,
    )

    # ── 2. The Most Recent Requests ────────────────────────────
    recent_q = (
        select(Incident)
        .where(Incident.reporter_id == current_user.id)
        .order_by(Incident.created_at.desc())
        .limit(limit)
    )
    recent_res = await db.execute(recent_q)
    recent_incidents = recent_res.scalars().all()
    recent_requests = [IncidentOut.model_validate(inc) for inc in recent_incidents]

    # ── 3. Coordinate Resolution (For Shelter Proximity) ──────────
    user_lat = lat
    user_lon = lon
    loc_source = "query"

    if user_lat is None or user_lon is None:
        # Check if user has a recent incident with coordinates
        last_with_coords_q = (
            select(Incident.latitude, Incident.longitude)
            .where(
                Incident.reporter_id == current_user.id,
                Incident.latitude.is_not(None),
                Incident.longitude.is_not(None),
            )
            .order_by(Incident.created_at.desc())
            .limit(1)
        )
        last_coords = (await db.execute(last_with_coords_q)).first()
        if last_coords and last_coords[0] is not None and last_coords[1] is not None:
            user_lat = last_coords[0]
            user_lon = last_coords[1]
            loc_source = "incident"
        else:
            # Fallback to central Pune coordinates (Shaniwar Wada / PMC center)
            user_lat = 18.5204
            user_lon = 73.8567
            loc_source = "default"

    # ── 4. Nearby Shelters (3 Closest) ───────────────────────────
    shelters_q = select(Place).where(
        Place.type == PlaceTypeEnum.shelter,
        Place.available == True,
    )
    shelters_res = await db.execute(shelters_q)
    all_shelters = shelters_res.scalars().all()

    shelters_with_dist = []
    for s in all_shelters:
        dist = haversine_km(user_lat, user_lon, s.latitude, s.longitude)
        shelters_with_dist.append(
            NearbyShelterOut(
                id=s.id,
                name=s.name,
                address=s.address,
                latitude=s.latitude,
                longitude=s.longitude,
                capacity=s.capacity,
                available=s.available,
                contact=s.contact,
                distance_km=dist,
            )
        )

    # Sort by distance ascending and pick top 3
    shelters_with_dist.sort(key=lambda s: s.distance_km)
    closest_shelters = shelters_with_dist[:3]

    # ── 5. Announcements / Alerts ────────────────────────────────
    announcements = [AnnouncementOut(**item) for item in get_default_announcements()]

    return CitizenOverviewOut(
        stats=stats,
        recent_requests=recent_requests,
        announcements=announcements,
        nearby_shelters=closest_shelters,
        user_location={
            "latitude": user_lat,
            "longitude": user_lon,
            "source": loc_source,
        },
    )


@router.get("/stats/global", response_model=GlobalStatCardsOut)
async def get_global_stats(
    lat: Optional[float] = Query(None, description="Citizen latitude"),
    lon: Optional[float] = Query(None, description="Citizen longitude"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns live aggregated KPIs for the citizen portal stat cards row:
    1. Active incidents count & trend (% from last 24h)
    2. Total people affected (single estimated value from active reports)
    3. Response teams total & on ground (busy)
    4. Shelters total & nearby count (if lat/lon provided)
    5. Relief supply points count & overall stock level status
    """
    now = datetime.now(timezone.utc)
    one_day_ago = now - timedelta(hours=24)
    two_days_ago = now - timedelta(hours=48)

    # 1. Active Incidents (reported, under_review, assigned, in_progress)
    active_statuses = [
        StatusEnum.reported,
        StatusEnum.under_review,
        StatusEnum.assigned,
        StatusEnum.in_progress,
    ]
    active_incidents_q = select(func.count(Incident.id)).where(Incident.status.in_(active_statuses))
    active_incidents_res = await db.execute(active_incidents_q)
    active_incidents_count = active_incidents_res.scalar() or 0

    # Trend: incidents created in last 24h vs previous 24h
    incidents_last_24h_q = select(func.count(Incident.id)).where(
        Incident.created_at >= one_day_ago
    )
    incidents_prev_24h_q = select(func.count(Incident.id)).where(
        Incident.created_at >= two_days_ago,
        Incident.created_at < one_day_ago,
    )
    c_last_24h = (await db.execute(incidents_last_24h_q)).scalar() or 0
    c_prev_24h = (await db.execute(incidents_prev_24h_q)).scalar() or 0

    if c_prev_24h == 0:
        trend_pct = float(c_last_24h * 10) if c_last_24h > 0 else 0.0
    else:
        trend_pct = round(((c_last_24h - c_prev_24h) / c_prev_24h) * 100.0, 1)

    # 2. People Affected (sum of people_affected from active incidents)
    affected_q = select(func.sum(Incident.people_affected)).where(Incident.status.in_(active_statuses))
    affected_res = await db.execute(affected_q)
    total_people_affected = affected_res.scalar() or 0

    # 3. Response Teams (total & busy / on-ground)
    teams_total_q = select(func.count(ResponseTeam.id))
    teams_total = (await db.execute(teams_total_q)).scalar() or 0

    teams_busy_q = select(func.count(ResponseTeam.id)).where(ResponseTeam.status == TeamStatusEnum.busy)
    teams_on_ground = (await db.execute(teams_busy_q)).scalar() or 0

    # 4. Shelters
    shelters_q = select(Place).where(
        Place.type == PlaceTypeEnum.shelter,
        Place.available == True,
    )
    shelters_res = await db.execute(shelters_q)
    shelters_list = shelters_res.scalars().all()
    total_shelters = len(shelters_list)

    nearby_shelters_count = None
    if lat is not None and lon is not None:
        # Count shelters within 10 km
        nearby_shelters_count = sum(
            1 for s in shelters_list if haversine_km(lat, lon, s.latitude, s.longitude) <= 10.0
        )

    # 5. Relief Supplies & Stock Level
    supplies_q = select(Place).where(Place.type == PlaceTypeEnum.relief_supply)
    supplies_res = await db.execute(supplies_q)
    supplies_list = supplies_res.scalars().all()
    total_supply_points = len(supplies_list)

    # Stock level calculation based on capacity and availability
    if total_supply_points == 0:
        stock_status = "Adequate"
    else:
        available_pts = sum(1 for p in supplies_list if p.available)
        avail_ratio = available_pts / total_supply_points
        if avail_ratio >= 0.75:
            stock_status = "Good"
        elif avail_ratio >= 0.4:
            stock_status = "Adequate"
        else:
            stock_status = "Low"

    return GlobalStatCardsOut(
        active_incidents=active_incidents_count,
        incident_trend_pct=trend_pct,
        people_affected=total_people_affected,
        total_response_teams=teams_total,
        teams_on_ground=teams_on_ground,
        total_shelters=total_shelters,
        nearby_shelters_count=nearby_shelters_count,
        total_supply_points=total_supply_points,
        stock_level_status=stock_status,
    )

