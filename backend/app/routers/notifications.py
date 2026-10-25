"""
Notifications router — citizen & operational alerts.

Endpoints
---------
GET  /notifications               — list own notifications (paginated, filterable)
PATCH /notifications/{id}/read    — mark one as read
POST  /notifications/read-all     — mark all unread as read
GET   /announcements              — public announcements (no auth required)
GET   /notifications/unread-count — quick badge count
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Notification, User
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])

# ── Static announcements (mirrors citizen overview) ───────────────────────────

_ANNOUNCEMENTS = [
    {
        "id": "ann-1",
        "title": "IMD Red Alert: Heavy Rainfall Forecast in Pune & Ghats",
        "message": (
            "Continuous heavy downpours expected across Pune city, Pimpri-Chinchwad, "
            "and Maval over the next 24–48 hours. Avoid low-lying bridges and waterlogged underpasses."
        ),
        "severity": "critical",
        "source": "District Disaster Management Authority (DDMA), Pune",
        "issued_at": datetime(2026, 10, 25, 8, 30, tzinfo=timezone.utc).isoformat(),
        "active": True,
    },
    {
        "id": "ann-2",
        "title": "Khadakwasla Dam: Controlled Water Discharge in Progress",
        "message": (
            "Controlled release of 14,800 cusecs into Mutha River basin. "
            "High vigilance advised for riverfront areas along Deccan Gymkhana, Pulachi Wadi, and Sinhagad Road."
        ),
        "severity": "warning",
        "source": "Water Resources Department & PMC Flood Cell",
        "issued_at": datetime(2026, 10, 25, 14, 0, tzinfo=timezone.utc).isoformat(),
        "active": True,
    },
    {
        "id": "ann-3",
        "title": "Emergency Control Room & Relief Helpline Numbers",
        "message": (
            "PMC Disaster Helpline: 020-25501269. Police: 112. Fire & Rescue: 101. "
            "NDRF Control Room: 1077 (Toll-free). Ambulance: 108."
        ),
        "severity": "info",
        "source": "Pune Smart City Emergency Operations Center (EOC)",
        "issued_at": datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
        "active": True,
    },
    {
        "id": "ann-4",
        "title": "NDRF Teams Deployed Across Pune, Nashik & Kolhapur",
        "message": (
            "Six NDRF rescue teams are pre-positioned in flood-prone districts. "
            "Citizens in Sangli and Kolhapur should follow evacuation advisories from local authorities."
        ),
        "severity": "warning",
        "source": "National Disaster Response Force (NDRF)",
        "issued_at": datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc).isoformat(),
        "active": True,
    },
]


# ── Unread count (badge) ──────────────────────────────────────────────────────

@router.get("/unread-count", tags=["notifications"])
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the count of unread notifications for the authenticated user."""
    result = await db.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    count = result.scalar() or 0
    return {"unread_count": count}


# ── List notifications ────────────────────────────────────────────────────────

@router.get("", response_model=list[NotificationOut])
async def list_my_notifications(
    type: Optional[str] = Query(None, description="Filter by type prefix, e.g. 'status_update'"),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve notifications for the authenticated user, newest first."""
    query = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
    )
    if type:
        query = query.where(Notification.type == type)
    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


# ── Mark one as read ──────────────────────────────────────────────────────────

@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a specific notification as read (own only)."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


# ── Mark all as read ──────────────────────────────────────────────────────────

@router.post("/read-all", tags=["notifications"])
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all unread notifications for the current user as read."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read"}


# ── Public announcements ──────────────────────────────────────────────────────

@router.get("/announcements", tags=["notifications"])
async def list_announcements(active_only: bool = Query(True)):
    """
    Public announcements — no authentication required.
    Returns static advisory data from DDMA / PMC / NDRF.
    In a production build this would be backed by a database table.
    """
    data = _ANNOUNCEMENTS
    if active_only:
        data = [a for a in data if a.get("active")]
    return data
