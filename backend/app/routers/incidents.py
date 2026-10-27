"""
Incident routes â€” CRUD + assignment + status management.
"""

import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record_audit_event

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.services.incident_service import IncidentService
from app.services.storage_service import get_storage_service
from app.services.notification_service import NotificationService
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
    IncidentCancelRequest,
    IncidentCreate,
    IncidentDetail,
    IncidentNoteRequest,
    IncidentOut,
    PaginatedIncidentsOut,
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


# â”€â”€ Citizen: submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user can report an incident. Priority and status are
    always set server-side (pending / reported) â€” client values are ignored."""
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

    # Decoupled SQS trigger â€” runs after the DB commit, failure never blocks the response.
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


# â”€â”€ Photos: S3 Presigned URLs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ Citizen: own incidents (paginated, filtered, searchable) â”€â”€

@router.get("/mine")
async def my_incidents(
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status"),
    status_filter: Optional[str] = Query(None, alias="status_filter"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by ID or public code"),
    id: Optional[int] = Query(None, description="Filter directly by numeric ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Incident).where(Incident.reporter_id == current_user.id)

    chosen_status = status or status_filter
    if chosen_status:
        query = query.where(Incident.status == chosen_status)
    if category:
        query = query.where(Incident.category == category)
    if id is not None:
        query = query.where(Incident.id == id)
    elif search:
        s = search.strip()
        if s.isdigit():
            query = query.where(or_(Incident.id == int(s), Incident.public_code.ilike(f"%{s}%")))
        else:
            query = query.where(or_(
                Incident.public_code.ilike(f"%{s}%"),
                Incident.tracking_code.ilike(f"%{s}%"),
                Incident.address.ilike(f"%{s}%"),
            ))

    query = query.order_by(Incident.created_at.desc())

    if page is not None:
        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar_one()
        offset = (page - 1) * limit
        paged_query = query.offset(offset).limit(limit)
        items = (await db.execute(paged_query)).scalars().all()
        pages = math.ceil(total / limit) if total > 0 else 1
        return PaginatedIncidentsOut(
            items=[IncidentOut.model_validate(i) for i in items],
            total=total,
            page=page,
            limit=limit,
            pages=pages,
        )

    # When page is omitted, return plain list for backwards compatibility
    items = (await db.execute(query)).scalars().all()
    return [IncidentOut.model_validate(i) for i in items]


# â”€â”€ Admin / Responder: list all â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            selectinload(Incident.assignments).selectinload(Assignment.team),
            selectinload(Incident.status_history),
        )
        .where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Only owner or admin/responder can view incident details
    role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role not in ["admin", "responder"] and incident.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only the incident owner can view this incident.",
        )

    # Presign photo download URL if attached
    photo_url = None
    if incident.photo_key:
        try:
            storage = get_storage_service()
            photo_url = storage.presign_download(photo_key=incident.photo_key, expires_in=3600)
        except Exception:
            photo_url = None

    # Load assignments with team names
    assigned_team_name = None
    assignment_outs = []
    for a in incident.assignments:
        t_name = a.team.name if getattr(a, "team", None) else None
        if not assigned_team_name and t_name:
            assigned_team_name = t_name
        a_out = AssignmentOut.model_validate(a)
        a_out.team_name = t_name
        assignment_outs.append(a_out)

    # Sort status history chronologically
    sorted_history = sorted(
        incident.status_history,
        key=lambda h: h.created_at or datetime.min,
    )

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
        photo_url=photo_url,
        assigned_team_name=assigned_team_name,
        triage_score=incident.triage_score,
        triage_reason=incident.triage_reason,
        auto_triaged_at=incident.auto_triaged_at,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
        reporter=UserOut.model_validate(incident.reporter) if incident.reporter else None,
        assignments=assignment_outs,
        status_history=[StatusHistoryOut.model_validate(h) for h in sorted_history],
    )


# â”€â”€ Citizen/Admin: Cancel Incident (ONLY while status is reported) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/{incident_id}/cancel", response_model=IncidentOut)
@router.patch("/{incident_id}/cancel", response_model=IncidentOut)
async def cancel_incident(
    incident_id: int,
    body: IncidentCancelRequest = IncidentCancelRequest(),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel an emergency request.
    Enforced rule: only the incident owner (or admin) can cancel, and ONLY while
    the status is 'reported'. Once assigned or in progress, cancellation is blocked.
    """
    result = await db.execute(
        select(Incident).options(selectinload(Incident.assignments)).where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role not in ["admin", "responder"] and incident.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to cancel this incident.")

    curr_status = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)
    if curr_status != "reported":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot cancel incident. Only incidents with status 'reported' can be cancelled. "
                f"Current status is '{curr_status}'."
            ),
        )

    old_status = curr_status
    incident.status = StatusEnum.cancelled

    cancel_note = f"Cancelled by reporter: {body.reason}" if body.reason else "Cancelled by reporter"
    history = StatusHistory(
        incident_id=incident_id,
        old_status=old_status,
        new_status="cancelled",
        changed_by=current_user.id,
        note=cancel_note,
    )
    db.add(history)

    client_ip = request.client.host if request and request.client else None
    await record_audit_event(
        db,
        action="incident.cancelled",
        actor_id=current_user.id,
        actor_role=role,
        entity_type="incident",
        entity_id=incident_id,
        details={"old_status": old_status, "new_status": "cancelled", "reason": body.reason},
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(incident)
    return incident


# â”€â”€ Citizen/Admin: Add Note to Incident (ONLY while reported for citizens) â”€â”€â”€

@router.post("/{incident_id}/note", response_model=StatusHistoryOut)
@router.post("/{incident_id}/notes", response_model=StatusHistoryOut)
async def add_incident_note(
    incident_id: int,
    body: IncidentNoteRequest,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a note or update to an existing incident.
    Enforced rule: citizens can only add notes while status is 'reported'.
    Notes appear directly in the incident's status timeline.
    """
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role not in ["admin", "responder"] and incident.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to add notes to this incident.")

    curr_status = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)
    if role not in ["admin", "responder"] and curr_status != "reported":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Citizens can only add notes while the incident status is 'reported'. "
                f"Current status is '{curr_status}'."
            ),
        )

    note_text = f"[Citizen Note] {body.note}" if role == "citizen" else body.note
    history = StatusHistory(
        incident_id=incident_id,
        old_status=curr_status,
        new_status=curr_status,
        changed_by=current_user.id,
        note=note_text,
    )
    db.add(history)

    client_ip = request.client.host if request and request.client else None
    await record_audit_event(
        db,
        action="incident.note_added",
        actor_id=current_user.id,
        actor_role=role,
        entity_type="incident",
        entity_id=incident_id,
        details={"status": curr_status, "note": body.note},
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(history)
    return history


# â”€â”€ Admin: set priority â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ Admin: assign team â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    # â”€â”€ Notify reporter via DB (NotificationService) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Re-fetch incident so we have the freshest state after commit
    inc_result = await db.execute(select(Incident).where(Incident.id == incident_id))
    fresh_incident = inc_result.scalar_one_or_none()
    if fresh_incident:
        notif_svc = NotificationService(db)
        await notif_svc.notify_status_change(
            incident=fresh_incident,
            old_status=old_status,
            new_status=StatusEnum.assigned.value,
            changed_by_id=current_user.id,
            extra_message=f"Team: {team.name}",
        )
        await db.commit()

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


# â”€â”€ Admin/Responder: update status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    # â”€â”€ Notify reporter via DB (NotificationService) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    notif_svc = NotificationService(db)
    await notif_svc.notify_status_change(
        incident=incident,
        old_status=old_status,
        new_status=body.status,
        changed_by_id=current_user.id,
        extra_message=body.note or "",
    )
    await db.commit()

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


# ── Admin/Responder: mark as responding ───────────────────────

@router.post("/{incident_id}/respond", response_model=IncidentOut)
async def mark_as_responding(
    incident_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "responder")),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_status = incident.status.value if hasattr(incident.status, 'value') else incident.status

    # Record history
    history = StatusHistory(
        incident_id=incident_id,
        old_status=old_status,
        new_status=StatusEnum.in_progress.value,
        changed_by=current_user.id,
        note="Marked as responding by emergency personnel",
    )
    db.add(history)

    incident.status = StatusEnum.in_progress

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.marked_responding",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="incident",
        entity_id=incident_id,
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(incident)

    notif_svc = NotificationService(db)
    await notif_svc.notify_status_change(
        incident=incident,
        old_status=old_status,
        new_status=StatusEnum.in_progress.value,
        changed_by_id=current_user.id,
        extra_message="Emergency team is actively responding",
    )
    await db.commit()

    return incident

