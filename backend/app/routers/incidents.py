"""
Incident routes — CRUD + assignment + status management.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import (
    Assignment,
    Incident,
    StatusHistory,
    Team,
    User,
    StatusEnum,
)
from app.schemas import (
    AssignmentOut,
    AssignTeamRequest,
    IncidentCreate,
    IncidentDetail,
    IncidentOut,
    PriorityUpdate,
    StatusHistoryOut,
    StatusUpdate,
    UserOut,
)
from app.aws_services import enqueue_incident_processing, notify_status_change

router = APIRouter(prefix="/incidents", tags=["incidents"])


# ── Citizen: submit ───────────────────────────────────────────

@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user can report an incident."""
    incident = Incident(
        reporter_id=current_user.id,
        category=body.category,
        description=body.description,
        location_text=body.location_text,
        latitude=body.latitude,
        longitude=body.longitude,
        people_affected=body.people_affected,
    )
    db.add(incident)
    await db.flush()
    await db.refresh(incident)

    # AWS stub: enqueue for background processing
    await enqueue_incident_processing(incident.id)

    return incident


# ── Citizen: own incidents ────────────────────────────────────

@router.get("/mine", response_model=list[IncidentOut])
async def my_incidents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Incident)
        .where(Incident.reporter_id == current_user.id)
        .order_by(Incident.created_at.desc())
    )
    return result.scalars().all()


# ── Admin / Responder: list all ───────────────────────────────

@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "responder")),
):
    query = select(Incident)
    if status_filter:
        query = query.where(Incident.status == status_filter)
    if priority:
        query = query.where(Incident.priority == priority)
    if category:
        query = query.where(Incident.category == category)
    query = query.order_by(Incident.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


# ── Detail ────────────────────────────────────────────────────

@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.reporter),
            selectinload(Incident.assignments),
            selectinload(Incident.status_history),
        )
        .where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Citizens can only view their own incidents
    if current_user.role.value == "citizen" and incident.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return IncidentDetail(
        id=incident.id,
        reporter_id=incident.reporter_id,
        category=incident.category.value if hasattr(incident.category, 'value') else incident.category,
        description=incident.description,
        location_text=incident.location_text,
        latitude=incident.latitude,
        longitude=incident.longitude,
        people_affected=incident.people_affected,
        priority=incident.priority.value if hasattr(incident.priority, 'value') else incident.priority,
        status=incident.status.value if hasattr(incident.status, 'value') else incident.status,
        photo_key=incident.photo_key,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
        reporter=UserOut.model_validate(incident.reporter) if incident.reporter else None,
        assignments=[AssignmentOut.model_validate(a) for a in incident.assignments],
        status_history=[StatusHistoryOut.model_validate(h) for h in incident.status_history],
    )


# ── Admin: set priority ──────────────────────────────────────

@router.patch("/{incident_id}/priority", response_model=IncidentOut)
async def update_priority(
    incident_id: int,
    body: PriorityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.priority = body.priority
    await db.flush()
    await db.refresh(incident)
    return incident


# ── Admin: assign team ────────────────────────────────────────

@router.post("/{incident_id}/assign", response_model=AssignmentOut, status_code=201)
async def assign_team(
    incident_id: int,
    body: AssignTeamRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    # Validate incident
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Validate team
    result = await db.execute(select(Team).where(Team.id == body.team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not team.is_available:
        raise HTTPException(status_code=400, detail="Team is not available")

    # Create assignment
    assignment = Assignment(
        incident_id=incident_id,
        team_id=body.team_id,
        assigned_by=current_user.id,
    )
    db.add(assignment)

    # Mark team unavailable
    team.is_available = False

    # Update incident status to assigned
    old_status = incident.status.value if hasattr(incident.status, 'value') else incident.status
    incident.status = StatusEnum.assigned

    # Record status change
    history = StatusHistory(
        incident_id=incident_id,
        old_status=old_status,
        new_status=StatusEnum.assigned.value,
        changed_by=current_user.id,
        note=f"Assigned to team: {team.name}",
    )
    db.add(history)

    await db.flush()
    await db.refresh(assignment)

    # AWS stub
    await notify_status_change(incident_id, "assigned", f"Team {team.name} assigned")

    return assignment


# ── Admin/Responder: update status ───────────────────────────

@router.patch("/{incident_id}/status", response_model=IncidentOut)
async def update_status(
    incident_id: int,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "responder")),
):
    result = await db.execute(
        select(Incident).options(selectinload(Incident.assignments)).where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_status = incident.status.value if hasattr(incident.status, 'value') else incident.status

    # Record history
    history = StatusHistory(
        incident_id=incident_id,
        old_status=old_status,
        new_status=body.status,
        changed_by=current_user.id,
        note=body.note,
    )
    db.add(history)

    incident.status = body.status

    # Free teams when resolved
    if body.status == "resolved":
        for assignment in incident.assignments:
            team_result = await db.execute(select(Team).where(Team.id == assignment.team_id))
            team = team_result.scalar_one_or_none()
            if team:
                team.is_available = True

    await db.flush()
    await db.refresh(incident)

    # AWS stub
    await notify_status_change(incident_id, body.status, body.note or "")

    return incident
