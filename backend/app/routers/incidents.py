"""
Incident routes — CRUD + assignment + status management.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record_audit_event

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.services.incident_service import IncidentService
from app.services.storage_service import get_storage_service
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
    PhotoDownloadResponse,
    PhotoUploadRequest,
    PhotoUploadResponse,
    PriorityUpdate,
    StatusHistoryOut,
    StatusUpdate,
    UserOut,
)
from app.aws_services import (
    enqueue_incident_processing,
    generate_presigned_download_url,
    generate_presigned_upload_url,
    notify_status_change,
)

router = APIRouter(prefix="/incidents", tags=["incidents"])


# ── Citizen: submit ───────────────────────────────────────────

@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user can report an incident. Priority and status are
    always set server-side (pending / reported) — client values are ignored."""
    service = IncidentService(db)
    incident = await service.create(
        category=body.category,
        description=body.description,
        address=body.address,
        latitude=body.latitude,
        longitude=body.longitude,
        people_affected=body.people_affected,
        photo_key=body.photo_key,
        reporter_id=current_user.id,
    )

    # Decoupled SQS trigger — runs after the DB commit, failure never blocks the response.
    cat_val = incident.category.value if hasattr(incident.category, "value") else str(incident.category)
    await enqueue_incident_processing(
        incident_id=incident.id,
        category=cat_val,
        people_affected=incident.people_affected,
        description=incident.description,
        location_text=incident.location_text,
        created_at=incident.created_at.isoformat() if incident.created_at else None,
    )

    return incident


# ── Photos: S3 Presigned URLs ────────────────────────────────

@router.post("/photo-upload-url", response_model=PhotoUploadResponse)
async def get_precreation_photo_upload_url(
    body: PhotoUploadRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a presigned S3 PUT URL for uploading incident photo prior to creating incident.
    """
    try:
        upload_data = generate_presigned_upload_url(
            incident_id=0,
            content_type=body.content_type,
            file_ext=body.file_ext,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return PhotoUploadResponse(**upload_data)


@router.post("/{incident_id}/photo-upload-url", response_model=PhotoUploadResponse)
async def get_photo_upload_url(
    incident_id: int,
    body: PhotoUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a presigned S3 PUT URL for uploading incident emergency photos.
    Restricted to the incident reporter, responder, or admin.
    """
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if current_user.role.value == "citizen" and incident.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to upload photos for this incident")

    try:
        upload_data = generate_presigned_upload_url(
            incident_id=incident_id,
            content_type=body.content_type,
            file_ext=body.file_ext,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store key in database
    incident.photo_key = upload_data["photo_key"]
    await db.flush()
    await db.refresh(incident)

    return PhotoUploadResponse(**upload_data)


@router.get("/{incident_id}/photo-url", response_model=PhotoDownloadResponse)
async def get_photo_url(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a presigned GET URL for authorized users (reporter, admin, responder).
    Enforces that only the incident owner and admins/responders can retrieve the photo URL.
    """
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role not in ["admin", "responder"] and incident.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to view this incident photo")

    if not incident.photo_key:
        raise HTTPException(status_code=404, detail="No photo attached to this incident")

    storage = get_storage_service()
    download_url = storage.presign_download(photo_key=incident.photo_key, expires_in=300)
    return PhotoDownloadResponse(photo_url=download_url, photo_key=incident.photo_key)


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
        public_code=incident.public_code,
        tracking_code=incident.tracking_code,
        reporter_id=incident.reporter_id,
        category=incident.category.value if hasattr(incident.category, 'value') else incident.category,
        description=incident.description,
        address=incident.address,
        location_text=incident.location_text,
        latitude=incident.latitude,
        longitude=incident.longitude,
        people_affected=incident.people_affected,
        priority=incident.priority.value if hasattr(incident.priority, 'value') else incident.priority,
        status=incident.status.value if hasattr(incident.status, 'value') else incident.status,
        photo_key=incident.photo_key,
        triage_score=incident.triage_score,
        triage_reason=incident.triage_reason,
        auto_triaged_at=incident.auto_triaged_at,
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
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_prio = incident.priority.value if hasattr(incident.priority, 'value') else incident.priority
    incident.priority = body.priority
    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.priority_updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="incident",
        entity_id=incident.id,
        details={"old_priority": old_prio, "new_priority": body.priority},
        ip_address=client_ip,
    )
    await db.commit()
    await db.refresh(incident)
    return incident


# ── Admin: assign team ────────────────────────────────────────

@router.post("/{incident_id}/assign", response_model=AssignmentOut, status_code=201)
async def assign_team(
    incident_id: int,
    body: AssignTeamRequest,
    request: Request,
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

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.team_assigned",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="incident",
        entity_id=incident_id,
        details={"team_id": team.id, "team_name": team.name},
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(assignment)

    # Publish SNS assignment notification
    cat_val = incident.category.value if hasattr(incident.category, "value") else str(incident.category)
    prio_val = incident.priority.value if hasattr(incident.priority, "value") else str(incident.priority)
    await notify_status_change(
        incident_id=incident_id,
        new_status="assigned",
        message=f"Team '{team.name}' assigned by admin",
        category=cat_val,
        priority=prio_val,
        team_name=team.name,
    )

    return assignment


# ── Admin/Responder: update status ───────────────────────────

@router.patch("/{incident_id}/status", response_model=IncidentOut)
async def update_status(
    incident_id: int,
    body: StatusUpdate,
    request: Request,
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

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.status_updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="incident",
        entity_id=incident_id,
        details={"old_status": old_status, "new_status": body.status, "note": body.note},
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(incident)

    # Publish SNS status transition alert
    cat_val = incident.category.value if hasattr(incident.category, "value") else str(incident.category)
    prio_val = incident.priority.value if hasattr(incident.priority, "value") else str(incident.priority)
    await notify_status_change(
        incident_id=incident_id,
        new_status=body.status,
        message=body.note or "",
        category=cat_val,
        priority=prio_val,
    )

    return incident
