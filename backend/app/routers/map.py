"""
Live Map Router — Public disaster markers, emergency places, and affected zones.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Incident, Place, PlaceTypeEnum
from app.schemas import (
    AffectedZoneOut,
    PlaceOut,
    PublicIncidentMarker,
    PublicMapResponse,
)

router = APIRouter(prefix="/map", tags=["map"])


# ── Active Affected Zones / Hazard Polygons for Pune District ──
PUNE_AFFECTED_ZONES = [
    {
        "id": "zone-mutha",
        "name": "Mutha Riverfront Inundation & Dam Discharge Zone",
        "category": "flood",
        "severity": "critical",
        "center_latitude": 18.5140,
        "center_longitude": 73.8450,
        "radius_meters": 2200,
        "description": "Active discharge from Khadakwasla Dam. Low-lying riverfront along Deccan Gymkhana, Pulachi Wadi, and Baba Bhide Bridge submerged.",
    },
    {
        "id": "zone-sinhagad",
        "name": "Sinhagad Road Ekta Nagari High Waterlogging Basin",
        "category": "waterlogging",
        "severity": "high",
        "center_latitude": 18.4720,
        "center_longitude": 73.8300,
        "radius_meters": 1600,
        "description": "Backwater overflow and severe residential waterlogging in Ekta Nagari, Dwarka Society, and Manik Baug lowlands.",
    },
    {
        "id": "zone-ramnadi",
        "name": "Mula-Ramnadi Confluence Surge Belt (Baner-Aundh)",
        "category": "flood",
        "severity": "medium",
        "center_latitude": 18.5660,
        "center_longitude": 73.7920,
        "radius_meters": 1700,
        "description": "Flash surge risk at Ramnadi-Mula river junction. Heavy runoff inundating low bridges and adjacent society basements.",
    },
    {
        "id": "zone-hinjawadi",
        "name": "Hinjawadi Phase 3 Drainage Overflow & Labor Camp Hazard",
        "category": "waterlogging",
        "severity": "high",
        "center_latitude": 18.5830,
        "center_longitude": 73.7120,
        "radius_meters": 1500,
        "description": "Severe surface runoff near Megapolis Circle and Phase 3 labor camps with localized stream breaching.",
    },
]


def sanitize_general_area(location_text: Optional[str], address: Optional[str]) -> str:
    """Extract a broad neighborhood/district name without exposing exact street address."""
    raw = location_text or address or "Pune Metro Area"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) >= 2:
        # e.g., ["Megapolis Circle", "Phase 3", "Hinjawadi", "Pune"] -> "Hinjawadi, Pune"
        # e.g., ["Paud Road", "near Vanaz", "Kothrud", "Pune 411038"] -> "Kothrud, Pune"
        area = parts[-2]
        city = parts[-1].split(" ")[0]  # Strip pincodes if any
        return f"{area}, {city}"
    return raw


def round_coord_approx(coord: float, step: float = 0.005) -> float:
    """Round coordinate to ~500m precision (0.005 degrees is ~550m in latitude)."""
    return round(round(coord / step) * step, 4)


@router.get("/public", response_model=PublicMapResponse)
async def get_public_map_data(
    bbox: Optional[str] = Query(
        None,
        description="Bounding box in format 'min_lon,min_lat,max_lon,max_lat' (e.g. 73.7,18.4,73.9,18.6)",
    ),
    min_lat: Optional[float] = Query(None, description="Explicit min latitude"),
    max_lat: Optional[float] = Query(None, description="Explicit max latitude"),
    min_lon: Optional[float] = Query(None, description="Explicit min longitude"),
    max_lon: Optional[float] = Query(None, description="Explicit max longitude"),
    category: Optional[str] = Query(None, description="Filter by incident category"),
    status: Optional[str] = Query(None, description="Filter by incident status"),
    priority: Optional[str] = Query(None, description="Filter by incident priority"),
    db: AsyncSession = Depends(get_db),
):
    """
    Public live map data feed:
    - Incidents: coordinates rounded to ~500m; description, photos, and reporter identity omitted.
    - Places: open shelters, hospitals, relief supplies with public capacity and contact.
    - Affected zones: active flood/hazard polygons and evacuation perimeters.
    - Supports bounding box spatial queries.
    """
    # ── Parse Bounding Box ───────────────────────────────────────
    b_min_lon = min_lon
    b_min_lat = min_lat
    b_max_lon = max_lon
    b_max_lat = max_lat

    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(",")]
            if len(parts) == 4:
                b_min_lon, b_min_lat, b_max_lon, b_max_lat = parts
        except (ValueError, IndexError):
            pass

    # ── Query Public Incidents ───────────────────────────────────
    inc_query = select(Incident).where(
        Incident.latitude.is_not(None),
        Incident.longitude.is_not(None),
    )

    if b_min_lat is not None:
        inc_query = inc_query.where(Incident.latitude >= b_min_lat)
    if b_max_lat is not None:
        inc_query = inc_query.where(Incident.latitude <= b_max_lat)
    if b_min_lon is not None:
        inc_query = inc_query.where(Incident.longitude >= b_min_lon)
    if b_max_lon is not None:
        inc_query = inc_query.where(Incident.longitude <= b_max_lon)

    if category:
        inc_query = inc_query.where(Incident.category == category)
    if status:
        inc_query = inc_query.where(Incident.status == status)
    if priority:
        inc_query = inc_query.where(Incident.priority == priority)

    inc_query = inc_query.order_by(Incident.created_at.desc())
    inc_res = await db.execute(inc_query)
    raw_incidents = inc_res.scalars().all()

    public_incidents: List[PublicIncidentMarker] = []
    for inc in raw_incidents:
        approx_lat = round_coord_approx(inc.latitude)
        approx_lon = round_coord_approx(inc.longitude)
        general_area = sanitize_general_area(inc.location_text, inc.address)

        public_incidents.append(
            PublicIncidentMarker(
                id=inc.id,
                public_code=inc.public_code,
                category=inc.category.value if hasattr(inc.category, "value") else str(inc.category),
                approx_latitude=approx_lat,
                approx_longitude=approx_lon,
                general_area=general_area,
                priority=inc.priority.value if hasattr(inc.priority, "value") else str(inc.priority),
                status=inc.status.value if hasattr(inc.status, "value") else str(inc.status),
                people_affected=inc.people_affected,
                created_at=inc.created_at,
            )
        )

    # ── Query Public Places (Shelters, Hospitals, Relief Supplies) ─
    places_query = select(Place).where(Place.available == True)

    if b_min_lat is not None:
        places_query = places_query.where(Place.latitude >= b_min_lat)
    if b_max_lat is not None:
        places_query = places_query.where(Place.latitude <= b_max_lat)
    if b_min_lon is not None:
        places_query = places_query.where(Place.longitude >= b_min_lon)
    if b_max_lon is not None:
        places_query = places_query.where(Place.longitude <= b_max_lon)

    places_query = places_query.order_by(Place.type, Place.name)
    places_res = await db.execute(places_query)
    raw_places = places_res.scalars().all()
    places_out = [PlaceOut.model_validate(p) for p in raw_places]

    # ── Filter Affected Zones by Bounding Box (if provided) ───────
    filtered_zones = []
    for z in PUNE_AFFECTED_ZONES:
        c_lat = z["center_latitude"]
        c_lon = z["center_longitude"]
        if b_min_lat is not None and (c_lat < b_min_lat - 0.05 or c_lat > b_max_lat + 0.05):
            continue
        if b_min_lon is not None and (c_lon < b_min_lon - 0.05 or c_lon > b_max_lon + 0.05):
            continue
        filtered_zones.append(AffectedZoneOut(**z))

    return PublicMapResponse(
        incidents=public_incidents,
        places=places_out,
        affected_zones=filtered_zones,
        total_public_incidents=len(public_incidents),
        total_places=len(places_out),
    )
