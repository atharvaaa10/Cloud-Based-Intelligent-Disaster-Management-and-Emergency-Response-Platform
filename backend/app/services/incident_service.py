"""
IncidentService — encapsulates incident creation logic.

All business rules live here so the router stays thin.
When we add AWS SQS publishing, it goes at the end of create()
without touching the router at all.
"""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Incident, Notification, StatusHistory, StatusEnum


# ── Maharashtra geographic bounding box ──────────────────────────
# Approximate extents: lat 15.6 – 22.1, lon 72.6 – 80.9
# Covers all of Maharashtra including coastal and Vidarbha regions.
MH_LAT_MIN = 15.6
MH_LAT_MAX = 22.1
MH_LON_MIN = 72.6
MH_LON_MAX = 80.9


def validate_coordinates(lat: float | None, lon: float | None) -> str | None:
    """
    Returns an error string if the coordinates are out of Maharashtra bounds,
    or None if they're valid (or absent).
    """
    if lat is None and lon is None:
        return None  # coordinates are optional

    if lat is None or lon is None:
        return "Both latitude and longitude must be provided together."

    if not (MH_LAT_MIN <= lat <= MH_LAT_MAX):
        return (
            f"Latitude {lat} is outside Maharashtra ({MH_LAT_MIN}–{MH_LAT_MAX}). "
            "Please verify your coordinates."
        )
    if not (MH_LON_MIN <= lon <= MH_LON_MAX):
        return (
            f"Longitude {lon} is outside Maharashtra ({MH_LON_MIN}–{MH_LON_MAX}). "
            "Please verify your coordinates."
        )
    return None


class IncidentService:
    """
    Service layer for incident lifecycle.

    Usage:
        service = IncidentService(db)
        incident = await service.create(body, reporter_id=user.id)

    Future SQS publish step:
        After the DB commit in create(), call:
            await enqueue_incident_processing(incident_id=incident.id, ...)
        The abstraction is already wired in the router; the service does not
        import aws_services to keep unit-testing fast and dependency-free.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        category: str,
        description: str,
        address: str,
        latitude: float | None,
        longitude: float | None,
        people_affected: int,
        photo_key: str | None,
        reporter_id: int | None,
    ) -> Incident:
        """
        Create an incident, write the first status_history row, and send a
        "Report received" notification to the reporter.

        Priority is always set to `pending`.
        Status is always set to `reported`.
        No client-supplied priority or status is accepted.
        """
        db = self.db

        # ── 1. Build the incident (public_code & tracking_code auto-generated) ──
        incident = Incident(
            reporter_id=reporter_id,
            category=category,
            description=description,
            address=address,       # model __init__ syncs location_text ↔ address
            latitude=latitude,
            longitude=longitude,
            people_affected=people_affected,
            photo_key=photo_key,
            # priority defaults to PriorityEnum.pending via Column default
            # status  defaults to StatusEnum.reported via Column default
        )
        db.add(incident)
        # flush to get the DB-generated id without committing
        await db.flush()
        await db.refresh(incident)

        # ── 2. First status_history row ──────────────────────────────────────
        history = StatusHistory(
            incident_id=incident.id,
            old_status=StatusEnum.reported.value,
            new_status=StatusEnum.reported.value,
            changed_by=reporter_id,
            note="Report received — awaiting triage",
        )
        db.add(history)

        # ── 3. "Report received" notification (if reporter is known) ─────────
        if reporter_id is not None:
            notification = Notification(
                user_id=reporter_id,
                incident_id=incident.id,
                type="report_received",
                title="Emergency report received",
                message=(
                    f"Your emergency report ({incident.public_code}) has been received "
                    f"and is in the response queue. Tracking code: {incident.tracking_code}"
                ),
            )
            db.add(notification)

        await db.commit()
        await db.refresh(incident)
        return incident
