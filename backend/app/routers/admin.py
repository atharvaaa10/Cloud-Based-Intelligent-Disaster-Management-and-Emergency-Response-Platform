"""
Administrative routes — access strictly restricted to admin users.
Audit logging queries, operational system inspection, and admin reports.
"""

from datetime import datetime, timezone, timedelta, time
from typing import Optional, List, Dict, Any
import math

from fastapi import APIRouter, Depends, Query, HTTPException, Request, status as http_status
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import require_roles
from app.models import (
    AuditLog,
    User,
    Incident,
    StatusEnum,
    PriorityEnum,
    CategoryEnum,
    Team,
    Assignment,
    StatusHistory,
    Place,
    PlaceTypeEnum,
    ResponseTeam,
)
from app.schemas import (
    AuditLogListResponse,
    AuditLogOut,
    AdminOverviewOut,
    DailyIncidentCount,
    IncidentOut,
    AdminIncidentDetailOut,
    AdminIncidentListResponse,
    AdminIncidentPatchRequest,
    ReporterContactOut,
    StatusHistoryOut,
    AssignmentOut,
    AssignTeamRequest,
    PlaceOut,
    AffectedZoneOut,
    AdminIncidentMarker,
    AdminTeamMarker,
    AdminMapResponse,
)
from app.audit import record_audit_event
from app.services.notification_service import NotificationService
from app.aws_services import generate_presigned_download_url, notify_status_change
from app.scoring import calculate_rule_based_priority
from app.routers.map import PUNE_AFFECTED_ZONES
router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverviewOut)
async def get_admin_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Returns high-level operational metrics, status counts, 14-day trends,
    category distribution, and urgent critical alerts for the admin dashboard.
    Requires admin privileges.
    """
    # 1. Total incidents
    total_res = await db.execute(select(func.count(Incident.id)))
    total_incidents = total_res.scalar() or 0

    # 2. Pending reports (status: reported or under_review)
    pending_res = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.status.in_([StatusEnum.reported, StatusEnum.under_review])
        )
    )
    pending_reports = pending_res.scalar() or 0

    # 3. Active emergencies (status: assigned or in_progress)
    active_res = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.status.in_([StatusEnum.assigned, StatusEnum.in_progress])
        )
    )
    active_emergencies = active_res.scalar() or 0

    # 4. Resolved cases (status: resolved)
    resolved_res = await db.execute(
        select(func.count(Incident.id)).where(Incident.status == StatusEnum.resolved)
    )
    resolved_cases = resolved_res.scalar() or 0

    # 5. Critical alerts (priority: critical and status != resolved)
    critical_res = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.priority == PriorityEnum.critical,
            Incident.status != StatusEnum.resolved,
        )
    )
    critical_alerts = critical_res.scalar() or 0

    # 6. Incidents per day for the last 14 days
    now = datetime.now(timezone.utc)
    today = now.date()
    days = [(today - timedelta(days=i)) for i in range(13, -1, -1)]
    start_date = datetime.combine(days[0], time.min, tzinfo=timezone.utc)

    recent_incidents_res = await db.execute(
        select(Incident.created_at).where(Incident.created_at >= start_date)
    )
    day_counts = {d.isoformat(): 0 for d in days}
    for (created_at,) in recent_incidents_res.all():
        if created_at:
            d = (
                created_at.date()
                if hasattr(created_at, "date")
                else datetime.fromisoformat(str(created_at)).date()
            )
            d_str = d.isoformat()
            if d_str in day_counts:
                day_counts[d_str] += 1

    incidents_per_day = [
        DailyIncidentCount(date=d_str, count=count)
        for d_str, count in day_counts.items()
    ]

    # 7. Count by category
    by_cat_res = await db.execute(
        select(Incident.category, func.count(Incident.id)).group_by(Incident.category)
    )
    by_category = {cat.value: 0 for cat in CategoryEnum}
    for cat, count in by_cat_res.all():
        cat_val = cat.value if hasattr(cat, "value") else str(cat)
        by_category[cat_val] = count

    # 8. Top 5 critical incidents needing attention
    crit_incidents_query = (
        select(Incident)
        .where(
            Incident.priority == PriorityEnum.critical,
            Incident.status != StatusEnum.resolved,
        )
        .order_by(Incident.created_at.desc(), Incident.id.desc())
        .limit(5)
    )
    crit_incidents_res = await db.execute(crit_incidents_query)
    critical_items = crit_incidents_res.scalars().all()

    return AdminOverviewOut(
        total_incidents=total_incidents,
        pending_reports=pending_reports,
        active_emergencies=active_emergencies,
        resolved_cases=resolved_cases,
        critical_alerts=critical_alerts,
        incidents_per_day=incidents_per_day,
        by_category=by_category,
        critical_incidents=[
            IncidentOut.model_validate(item) for item in critical_items
        ],
    )


@router.get("/audit-log", response_model=AuditLogListResponse)
async def get_audit_log(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    action: Optional[str] = Query(None, description="Filter by audit action pattern"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    actor_id: Optional[int] = Query(None, description="Filter by actor user ID"),
    start_date: Optional[datetime] = Query(None, description="Filter from timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter to timestamp"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Returns paginated audit trail logs for administrative oversight.
    Requires admin privileges.
    """
    query = select(AuditLog).options(selectinload(AuditLog.actor))
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
        count_query = count_query.where(AuditLog.action.ilike(f"%{action}%"))

    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)

    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
        count_query = count_query.where(AuditLog.actor_id == actor_id)

    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
        count_query = count_query.where(AuditLog.created_at >= start_date)

    if end_date:
        query = query.where(AuditLog.created_at <= end_date)
        count_query = count_query.where(AuditLog.created_at <= end_date)

    # Count total matching rows
    total_result = await db.execute(count_query)
    total = total_result.scalar_one_or_none() or 0

    # Execute paginated query
    query = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    items = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogOut.model_validate(item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


# ── Incident Management Routes ─────────────────────────────────

ALLOWED_STATUS_TRANSITIONS = {
    "reported": ["under_review", "assigned", "cancelled"],
    "under_review": ["assigned", "cancelled"],
    "assigned": ["in_progress", "cancelled"],
    "in_progress": ["resolved", "cancelled"],
    "resolved": [],
    "cancelled": [],
}


@router.get("/incidents", response_model=AdminIncidentListResponse)
async def list_admin_incidents(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search ID, address, or description"),
    status: Optional[str] = Query(None, description="Filter by status (or 'pending', 'active')"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    category: Optional[str] = Query(None, description="Filter by category"),
    start_date: Optional[datetime] = Query(None, description="Filter from timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter to timestamp"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Paginated incident list with multi-field search, filtering, and sorting.
    Requires admin privileges.
    """
    query = select(Incident)
    count_query = select(func.count(Incident.id))

    # Search (ID, address, location_text, description, tracking code)
    if search and search.strip():
        term = search.strip()
        search_clauses = [
            Incident.description.ilike(f"%{term}%"),
            Incident.location_text.ilike(f"%{term}%"),
            Incident.address.ilike(f"%{term}%"),
            Incident.public_code.ilike(f"%{term}%"),
            Incident.tracking_code.ilike(f"%{term}%"),
        ]
        if term.isdigit():
            search_clauses.append(Incident.id == int(term))
        query = query.where(or_(*search_clauses))
        count_query = count_query.where(or_(*search_clauses))

    # Status filter
    if status and status.strip():
        st = status.strip().lower()
        if st == "pending":
            status_clause = Incident.status.in_([StatusEnum.reported, StatusEnum.under_review])
        elif st == "active":
            status_clause = Incident.status.in_([StatusEnum.assigned, StatusEnum.in_progress])
        elif "," in st:
            statuses = [s.strip() for s in st.split(",") if s.strip()]
            status_clause = Incident.status.in_(statuses)
        else:
            status_clause = (Incident.status == st)
        query = query.where(status_clause)
        count_query = count_query.where(status_clause)

    # Priority filter
    if priority and priority.strip():
        p_val = priority.strip().lower()
        query = query.where(Incident.priority == p_val)
        count_query = count_query.where(Incident.priority == p_val)

    # Category filter
    if category and category.strip():
        c_val = category.strip().lower()
        query = query.where(Incident.category == c_val)
        count_query = count_query.where(Incident.category == c_val)

    # Date range filters
    if start_date:
        query = query.where(Incident.created_at >= start_date)
        count_query = count_query.where(Incident.created_at >= start_date)
    if end_date:
        query = query.where(Incident.created_at <= end_date)
        count_query = count_query.where(Incident.created_at <= end_date)

    # Total count
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    # Sorting
    sort_field_map = {
        "created_at": Incident.created_at,
        "id": Incident.id,
        "priority": Incident.priority,
        "status": Incident.status,
        "category": Incident.category,
        "people_affected": Incident.people_affected,
    }
    col = sort_field_map.get(sort_by.lower(), Incident.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(col.asc(), Incident.id.asc())
    else:
        query = query.order_by(col.desc(), Incident.id.desc())

    # Pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    items_res = await db.execute(query)
    items = items_res.scalars().all()

    total_pages = math.ceil(total / limit) if limit > 0 else 1

    return AdminIncidentListResponse(
        items=[IncidentOut.model_validate(i) for i in items],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/incidents/{incident_id}", response_model=AdminIncidentDetailOut)
async def get_admin_incident_detail(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Returns complete incident details including presigned photo URL,
    reporter contact info, status history, active assignments, and
    deterministic rule-based suggested priority scoring.
    """
    query = (
        select(Incident)
        .options(
            selectinload(Incident.reporter),
            selectinload(Incident.status_history),
            selectinload(Incident.assignments).selectinload(Assignment.team),
        )
        .where(Incident.id == incident_id)
    )
    res = await db.execute(query)
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Generate photo download URL if photo_key is stored
    photo_url = None
    if incident.photo_key:
        try:
            photo_url = generate_presigned_download_url(incident.photo_key)
        except Exception:
            photo_url = None

    # Reporter contact
    reporter_data = None
    if incident.reporter:
        reporter_data = ReporterContactOut(
            id=incident.reporter.id,
            name=incident.reporter.name,
            full_name=incident.reporter.full_name,
            email=incident.reporter.email,
            phone=incident.reporter.phone,
        )

    # Status history sorted chronologically desc
    sorted_history = sorted(
        incident.status_history,
        key=lambda h: h.created_at or datetime.min,
        reverse=True,
    )
    status_history_out = []
    for h in sorted_history:
        status_history_out.append(
            StatusHistoryOut(
                id=h.id,
                incident_id=h.incident_id,
                old_status=h.old_status,
                new_status=h.new_status,
                changed_by=h.changed_by,
                created_at=h.created_at,
                changed_at=h.changed_at or h.created_at,
                note=h.note,
            )
        )

    # Assignments with team names
    assignments_out = []
    for a in incident.assignments:
        assignments_out.append(
            AssignmentOut(
                id=a.id,
                incident_id=a.incident_id,
                team_id=a.team_id,
                assigned_by=a.assigned_by,
                assigned_at=a.assigned_at,
                team_name=a.team.name if a.team else f"Team #{a.team_id}",
            )
        )

    # Deterministic rule-based priority scoring
    cat_str = incident.category.value if hasattr(incident.category, 'value') else str(incident.category)
    suggested = calculate_rule_based_priority(
        people_affected=incident.people_affected,
        category=cat_str,
        description=incident.description,
        address=incident.address or incident.location_text,
    )

    prio_str = incident.priority.value if hasattr(incident.priority, 'value') else str(incident.priority)
    status_str = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)

    return AdminIncidentDetailOut(
        id=incident.id,
        public_code=incident.public_code or f"INC-{incident.id}",
        tracking_code=incident.tracking_code or f"TRK-{incident.id}",
        reporter_id=incident.reporter_id,
        category=cat_str,
        description=incident.description or "",
        address=incident.address,
        location_text=incident.location_text,
        latitude=incident.latitude,
        longitude=incident.longitude,
        people_affected=incident.people_affected,
        priority=prio_str,
        status=status_str,
        photo_key=incident.photo_key,
        photo_url=photo_url,
        triage_score=incident.triage_score,
        triage_reason=incident.triage_reason,
        auto_triaged_at=incident.auto_triaged_at,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
        reporter=reporter_data,
        status_history=status_history_out,
        assignments=assignments_out,
        suggested_priority=suggested,
    )


@router.patch("/incidents/{incident_id}", response_model=AdminIncidentDetailOut)
async def update_admin_incident(
    incident_id: int,
    body: AdminIncidentPatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Modify incident priority and/or status.
    - Requires a non-empty note if status changes.
    - Validates allowed status transitions.
    - Writes StatusHistory row.
    - Sends citizen reporter notification.
    - Writes AuditLog row.
    """
    query = (
        select(Incident)
        .options(
            selectinload(Incident.reporter),
            selectinload(Incident.status_history),
            selectinload(Incident.assignments).selectinload(Assignment.team),
        )
        .where(Incident.id == incident_id)
    )
    res = await db.execute(query)
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_status = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)
    old_priority = incident.priority.value if hasattr(incident.priority, 'value') else str(incident.priority)

    status_changed = False
    priority_changed = False

    # 1. Status change validation & processing
    if body.status is not None:
        target_status = body.status.strip().lower()
        if target_status != old_status:
            # Check allowed transitions
            allowed = ALLOWED_STATUS_TRANSITIONS.get(old_status, [])
            if target_status not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status transition from '{old_status}' to '{target_status}'. Allowed transitions: {', '.join(allowed) if allowed else 'none (terminal status)'}",
                )

            # Note is mandatory for status change
            if not body.note or not body.note.strip():
                raise HTTPException(
                    status_code=400,
                    detail="A note is required when updating incident status.",
                )

            # Update status
            incident.status = target_status
            status_changed = True

            # Record StatusHistory row
            history_entry = StatusHistory(
                incident_id=incident.id,
                old_status=old_status,
                new_status=target_status,
                changed_by=current_user.id,
                note=body.note.strip(),
            )
            db.add(history_entry)

            # If resolved, free any assigned teams
            if target_status == "resolved":
                for assignment in incident.assignments:
                    if assignment.team:
                        assignment.team.is_available = True

    # 2. Priority change processing
    if body.priority is not None:
        target_prio = body.priority.strip().lower()
        valid_prios = [p.value for p in PriorityEnum]
        if target_prio not in valid_prios:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid priority '{target_prio}'. Allowed: {', '.join(valid_prios)}",
            )
        if target_prio != old_priority:
            incident.priority = target_prio
            priority_changed = True

    if not status_changed and not priority_changed:
        # No actual change requested
        return await get_admin_incident_detail(incident_id=incident_id, db=db, current_user=current_user)

    incident.updated_at = datetime.now(timezone.utc)

    # 3. Write AuditLog row
    client_ip = request.client.host if request.client else None
    audit_details = {
        "old_status": old_status,
        "new_status": incident.status.value if hasattr(incident.status, 'value') else str(incident.status),
        "old_priority": old_priority,
        "new_priority": incident.priority.value if hasattr(incident.priority, 'value') else str(incident.priority),
        "note": body.note.strip() if body.note else None,
    }
    await record_audit_event(
        db,
        action="incident.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="incident",
        entity_id=incident.id,
        details=audit_details,
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(incident)

    # 4. Notify reporting citizen via NotificationService
    if status_changed and incident.reporter_id:
        notif_svc = NotificationService(db)
        await notif_svc.notify_status_change(
            incident=incident,
            old_status=old_status,
            new_status=incident.status.value if hasattr(incident.status, 'value') else str(incident.status),
            changed_by_id=current_user.id,
            extra_message=body.note.strip() if body.note else None,
        )
        await db.commit()

    return await get_admin_incident_detail(incident_id=incident_id, db=db, current_user=current_user)


@router.post("/incidents/{incident_id}/assign", response_model=AssignmentOut, status_code=201)
async def assign_admin_incident_team(
    incident_id: int,
    body: AssignTeamRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Assign an available response team to an incident.
    - Verifies team availability (is_available == True).
    - Sets team to busy (is_available = False).
    - Sets incident status to assigned.
    - Writes StatusHistory row.
    - Creates citizen notification.
    - Writes AuditLog row.
    """
    # 1. Fetch incident
    res = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # 2. Fetch team
    team_res = await db.execute(select(Team).where(Team.id == body.team_id))
    team = team_res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if not team.is_available:
        raise HTTPException(status_code=400, detail=f"Team '{team.name}' is currently unavailable/dispatched.")

    # 3. Create Assignment
    assignment = Assignment(
        incident_id=incident.id,
        team_id=team.id,
        assigned_by=current_user.id,
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(assignment)

    # 4. Update team and incident
    team.is_available = False
    old_status = incident.status.value if hasattr(incident.status, 'value') else str(incident.status)
    incident.status = StatusEnum.assigned
    incident.updated_at = datetime.now(timezone.utc)

    # 5. Record StatusHistory
    history = StatusHistory(
        incident_id=incident.id,
        old_status=old_status,
        new_status="assigned",
        changed_by=current_user.id,
        note=f"Assigned to response team: {team.name}",
    )
    db.add(history)

    # 6. AuditLog
    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.team_assigned",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="incident",
        entity_id=incident.id,
        details={"team_id": team.id, "team_name": team.name},
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(assignment)

    # 7. Notify reporting citizen
    notif_svc = NotificationService(db)
    await notif_svc.notify_status_change(
        incident=incident,
        old_status=old_status,
        new_status="assigned",
        changed_by_id=current_user.id,
        extra_message=f"Response team '{team.name}' has been deployed.",
    )
    await db.commit()

    # 8. Publish SNS notification
    cat_val = incident.category.value if hasattr(incident.category, 'value') else str(incident.category)
    prio_val = incident.priority.value if hasattr(incident.priority, 'value') else str(incident.priority)
    await notify_status_change(
        incident_id=incident.id,
        new_status="assigned",
        message=f"Team '{team.name}' assigned by admin",
        category=cat_val,
        priority=prio_val,
        team_name=team.name,
    )

    return AssignmentOut(
        id=assignment.id,
        incident_id=assignment.incident_id,
        team_id=assignment.team_id,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
        team_name=team.name,
    )



# ── Live Admin Map Route ────────────────────────────────────────

@router.get("/map", response_model=AdminMapResponse)
async def get_admin_map_data(
    bbox: Optional[str] = Query(None, description="Bounding box 'min_lon,min_lat,max_lon,max_lat'"),
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lon: Optional[float] = Query(None),
    max_lon: Optional[float] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Administrative live map data feed.
    - Exact GPS coordinates for all incidents (unfuzzed).
    - Full incident details including presigned photo URLs and reporter contact.
    - Categorized places: shelters, hospitals, relief supplies.
    - Active field response teams with exact GPS coordinates.
    - Pune district active affected hazard zones.
    """
    # 1. Parse Bounding Box
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

    # 2. Query Incidents (Exact coordinates, full reporter info, assignments)
    inc_query = (
        select(Incident)
        .options(
            selectinload(Incident.reporter),
            selectinload(Incident.assignments).selectinload(Assignment.team),
        )
        .where(
            Incident.latitude.is_not(None),
            Incident.longitude.is_not(None),
        )
    )

    if b_min_lat is not None:
        inc_query = inc_query.where(Incident.latitude >= b_min_lat)
    if b_max_lat is not None:
        inc_query = inc_query.where(Incident.latitude <= b_max_lat)
    if b_min_lon is not None:
        inc_query = inc_query.where(Incident.longitude >= b_min_lon)
    if b_max_lon is not None:
        inc_query = inc_query.where(Incident.longitude <= b_max_lon)

    if category and category.strip():
        inc_query = inc_query.where(Incident.category == category.strip().lower())

    if priority and priority.strip():
        inc_query = inc_query.where(Incident.priority == priority.strip().lower())

    if status and status.strip():
        st = status.strip().lower()
        if st == "pending":
            inc_query = inc_query.where(Incident.status.in_([StatusEnum.reported, StatusEnum.under_review]))
        elif st == "active":
            inc_query = inc_query.where(Incident.status.in_([StatusEnum.assigned, StatusEnum.in_progress]))
        elif "," in st:
            statuses = [s.strip() for s in st.split(",") if s.strip()]
            inc_query = inc_query.where(Incident.status.in_(statuses))
        else:
            inc_query = inc_query.where(Incident.status == st)

    inc_query = inc_query.order_by(Incident.created_at.desc())
    res = await db.execute(inc_query)
    raw_incidents = res.scalars().all()

    incident_markers: List[AdminIncidentMarker] = []
    for inc in raw_incidents:
        photo_url = None
        if inc.photo_key:
            try:
                photo_url = generate_presigned_download_url(inc.photo_key)
            except Exception:
                photo_url = None

        reporter_info = None
        if inc.reporter:
            reporter_info = ReporterContactOut(
                id=inc.reporter.id,
                name=inc.reporter.name,
                full_name=inc.reporter.full_name,
                email=inc.reporter.email,
                phone=inc.reporter.phone,
            )

        assigned_team_names = [a.team.name for a in inc.assignments if a.team]

        cat_str = inc.category.value if hasattr(inc.category, "value") else str(inc.category)
        prio_str = inc.priority.value if hasattr(inc.priority, "value") else str(inc.priority)
        status_str = inc.status.value if hasattr(inc.status, "value") else str(inc.status)

        incident_markers.append(
            AdminIncidentMarker(
                id=inc.id,
                public_code=inc.public_code or f"INC-{inc.id}",
                tracking_code=inc.tracking_code or f"TRK-{inc.id}",
                category=cat_str,
                description=inc.description or "",
                address=inc.address,
                location_text=inc.location_text,
                latitude=float(inc.latitude),  # Exact coordinate
                longitude=float(inc.longitude),  # Exact coordinate
                people_affected=inc.people_affected,
                priority=prio_str,
                status=status_str,
                photo_key=inc.photo_key,
                photo_url=photo_url,
                triage_score=inc.triage_score,
                triage_reason=inc.triage_reason,
                created_at=inc.created_at,
                reporter=reporter_info,
                assigned_teams=assigned_team_names,
            )
        )

    # 3. Query Places (Shelters, Hospitals, Relief Supplies)
    places_query = select(Place).where(Place.available == True)
    if b_min_lat is not None:
        places_query = places_query.where(Place.latitude >= b_min_lat)
    if b_max_lat is not None:
        places_query = places_query.where(Place.latitude <= b_max_lat)
    if b_min_lon is not None:
        places_query = places_query.where(Place.longitude >= b_min_lon)
    if b_max_lon is not None:
        places_query = places_query.where(Place.longitude <= b_max_lon)

    places_res = await db.execute(places_query)
    all_places = places_res.scalars().all()
    places_out = [PlaceOut.model_validate(p) for p in all_places]

    shelters = [p for p in places_out if p.type == "shelter"]
    hospitals = [p for p in places_out if p.type == "hospital"]
    supplies = [p for p in places_out if p.type == "relief_supply"]

    # 4. Query Response Teams (Exact GPS coordinates)
    teams_query = select(ResponseTeam)
    teams_res = await db.execute(teams_query)
    all_teams = teams_res.scalars().all()
    teams_out: List[AdminTeamMarker] = []
    for t in all_teams:
        teams_out.append(
            AdminTeamMarker(
                id=t.id,
                name=t.name,
                latitude=t.latitude,
                longitude=t.longitude,
                status=t.status.value if hasattr(t.status, "value") else str(t.status),
            )
        )

    # 5. Filter Affected Zones
    filtered_zones: List[AffectedZoneOut] = []
    for z in PUNE_AFFECTED_ZONES:
        c_lat = z["center_latitude"]
        c_lon = z["center_longitude"]
        if b_min_lat is not None and (c_lat < b_min_lat - 0.05 or c_lat > b_max_lat + 0.05):
            continue
        if b_min_lon is not None and (c_lon < b_min_lon - 0.05 or c_lon > b_max_lon + 0.05):
            continue
        filtered_zones.append(AffectedZoneOut(**z))

    return AdminMapResponse(
        incidents=incident_markers,
        shelters=shelters,
        hospitals=hospitals,
        supplies=supplies,
        places=places_out,
        response_teams=teams_out,
        affected_zones=filtered_zones,
        total_incidents=len(incident_markers),
        total_shelters=len(shelters),
        total_hospitals=len(hospitals),
        total_supplies=len(supplies),
        total_teams=len(teams_out),
        total_zones=len(filtered_zones),
    )
