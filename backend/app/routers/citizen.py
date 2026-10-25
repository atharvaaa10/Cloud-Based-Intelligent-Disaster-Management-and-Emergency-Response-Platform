"""
Citizen router — Citizen overview dashboard, personal stats, and public safety data.
"""

from datetime import datetime, timezone
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Incident, Place, PlaceTypeEnum, StatusEnum, User
from app.schemas import (
    AnnouncementOut,
    CitizenOverviewOut,
    CitizenStats,
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
DEFAULT_ANNOUNCEMENTS = [
    {
        "id": "ann-1",
        "title": "IMD Red Alert Warning: Heavy Rainfall Forecast in Pune & Ghats",
        "message": "Continuous heavy downpours expected across Pune city, Pimpri-Chinchwad, and Maval over the next 24-48 hours. Citizens are strongly advised to avoid low-lying bridges and waterlogged underpasses.",
        "severity": "critical",
        "source": "District Disaster Management Authority (DDMA), Pune",
        "issued_at": datetime(2026, 10, 25, 8, 30, tzinfo=timezone.utc),
        "active": True,
    },
    {
        "id": "ann-2",
        "title": "Khadakwasla Dam Controlled Water Discharge",
        "message": "Controlled release of 14,800 cusecs initiated into Mutha River basin. High vigilance advised for riverfront areas along Deccan Gymkhana, Pulachi Wadi, and Sinhagad Road.",
        "severity": "warning",
        "source": "Water Resources Department & PMC Flood Cell",
        "issued_at": datetime(2026, 10, 25, 14, 0, tzinfo=timezone.utc),
        "active": True,
    },
    {
        "id": "ann-3",
        "title": "Emergency Control Room & Relief Helpline Numbers",
        "message": "Pune Municipal Corporation Disaster Helpline: 020-25501269 / 020-25506800. Police: 112. Fire & Rescue: 101. NDRF Control Room: 1077 (Toll-free).",
        "severity": "info",
        "source": "Pune Smart City Emergency Operations Center (EOC)",
        "issued_at": datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc),
        "active": True,
    },
]


@router.get("/overview", response_model=CitizenOverviewOut)
async def get_citizen_overview(
    lat: Optional[float] = Query(None, ge=-90, le=90, description="Citizen latitude"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="Citizen longitude"),
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
    )

    # ── 2. The 3 Most Recent Requests ────────────────────────────
    recent_q = (
        select(Incident)
        .where(Incident.reporter_id == current_user.id)
        .order_by(Incident.created_at.desc())
        .limit(3)
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
    announcements = [AnnouncementOut(**item) for item in DEFAULT_ANNOUNCEMENTS]

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
