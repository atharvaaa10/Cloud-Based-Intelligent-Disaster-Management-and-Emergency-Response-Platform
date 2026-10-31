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
    TeamStatusEnum,
    Vehicle,
    VehicleStatusEnum,
    Supply,
    SupplyCategoryEnum,
    IncidentSupplyAllocation,
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
    ResourcesSummaryOut,
    AdminResponseTeamCreate,
    AdminResponseTeamUpdate,
    AdminResponseTeamPatch,
    AdminResponseTeamOut,
    VehicleCreate,
    VehicleUpdate,
    VehiclePatch,
    VehicleOut,
    SupplyCreate,
    SupplyUpdate,
    SupplyPatch,
    SupplyOut,
    ShelterCreate,
    ShelterUpdate,
    ShelterPatch,
    ShelterOut,
    IncidentAssignResourcesRequest,
    IncidentAssignResourcesResponse,
    IncidentReleaseResourcesResponse,
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


# ════════════════════════════════════════════════════════════════════
# ── Admin Resource Management (/admin/resources/*) ─────────────────
# ════════════════════════════════════════════════════════════════════

@router.get("/resources/summary", response_model=ResourcesSummaryOut)
async def get_resources_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Returns summary metrics for the resource strip:
    available teams, vehicles in use, low-stock items, free shelter beds.
    """
    res_teams = await db.execute(
        select(func.count(ResponseTeam.id)).where(ResponseTeam.status == TeamStatusEnum.available)
    )
    available_teams = res_teams.scalar() or 0

    res_all_teams = await db.execute(select(func.count(ResponseTeam.id)))
    total_teams = res_all_teams.scalar() or 0

    res_veh_use = await db.execute(
        select(func.count(Vehicle.id)).where(Vehicle.status == VehicleStatusEnum.in_use)
    )
    vehicles_in_use = res_veh_use.scalar() or 0

    res_all_veh = await db.execute(select(func.count(Vehicle.id)))
    total_vehicles = res_all_veh.scalar() or 0

    res_low_stock = await db.execute(
        select(func.count(Supply.id)).where(Supply.quantity <= Supply.low_stock_threshold)
    )
    low_stock_items = res_low_stock.scalar() or 0

    res_all_supplies = await db.execute(select(func.count(Supply.id)))
    total_supplies = res_all_supplies.scalar() or 0

    shelters_res = await db.execute(
        select(Place).where(Place.type == PlaceTypeEnum.shelter)
    )
    all_shelters = shelters_res.scalars().all()
    free_beds = sum(max(0, s.capacity - s.current_occupancy) for s in all_shelters)
    total_shelters = len(all_shelters)

    return ResourcesSummaryOut(
        available_teams=available_teams,
        vehicles_in_use=vehicles_in_use,
        low_stock_items=low_stock_items,
        free_shelter_beds=free_beds,
        total_teams=total_teams,
        total_vehicles=total_vehicles,
        total_supplies=total_supplies,
        total_shelters=total_shelters,
    )


# ── Teams CRUD & Patch ─────────────────────────────────────────────

@router.get("/resources/teams", response_model=List[AdminResponseTeamOut])
async def list_admin_teams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = (
        select(ResponseTeam)
        .options(selectinload(ResponseTeam.current_incident), selectinload(ResponseTeam.vehicles))
        .order_by(ResponseTeam.name.asc())
    )
    res = await db.execute(stmt)
    teams = res.scalars().all()

    out = []
    for t in teams:
        inc_code = t.current_incident.public_code if t.current_incident else None
        out.append(
            AdminResponseTeamOut(
                id=t.id,
                name=t.name,
                contact=t.contact,
                members_count=t.members_count,
                latitude=t.latitude,
                longitude=t.longitude,
                status=t.status.value if hasattr(t.status, "value") else str(t.status),
                current_incident_id=t.current_incident_id,
                current_incident_code=inc_code,
                created_at=t.created_at,
                assigned_vehicle_count=len(t.vehicles) if t.vehicles else 0,
            )
        )
    return out


@router.post("/resources/teams", response_model=AdminResponseTeamOut, status_code=http_status.HTTP_201_CREATED)
async def create_admin_team(
    body: AdminResponseTeamCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    team = ResponseTeam(
        name=body.name.strip(),
        contact=body.contact.strip() if body.contact else None,
        members_count=body.members_count,
        latitude=body.latitude,
        longitude=body.longitude,
        status=TeamStatusEnum(body.status),
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)

    await record_audit_event(
        db,
        action="team.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="response_team",
        entity_id=team.id,
        details={"name": team.name, "members_count": team.members_count, "status": team.status.value},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return AdminResponseTeamOut(
        id=team.id,
        name=team.name,
        contact=team.contact,
        members_count=team.members_count,
        latitude=team.latitude,
        longitude=team.longitude,
        status=team.status.value,
        current_incident_id=team.current_incident_id,
        current_incident_code=None,
        created_at=team.created_at,
        assigned_vehicle_count=0,
    )


@router.get("/resources/teams/{id}", response_model=AdminResponseTeamOut)
async def get_admin_team(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = (
        select(ResponseTeam)
        .options(selectinload(ResponseTeam.current_incident), selectinload(ResponseTeam.vehicles))
        .where(ResponseTeam.id == id)
    )
    res = await db.execute(stmt)
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")

    inc_code = t.current_incident.public_code if t.current_incident else None
    return AdminResponseTeamOut(
        id=t.id,
        name=t.name,
        contact=t.contact,
        members_count=t.members_count,
        latitude=t.latitude,
        longitude=t.longitude,
        status=t.status.value if hasattr(t.status, "value") else str(t.status),
        current_incident_id=t.current_incident_id,
        current_incident_code=inc_code,
        created_at=t.created_at,
        assigned_vehicle_count=len(t.vehicles) if t.vehicles else 0,
    )


@router.put("/resources/teams/{id}", response_model=AdminResponseTeamOut)
async def update_admin_team(
    id: int,
    body: AdminResponseTeamUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(ResponseTeam).where(ResponseTeam.id == id)
    res = await db.execute(stmt)
    team = res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    old_data = {"name": team.name, "contact": team.contact, "members_count": team.members_count, "status": team.status.value}
    team.name = body.name.strip()
    team.contact = body.contact.strip() if body.contact else None
    team.members_count = body.members_count
    if body.latitude is not None:
        team.latitude = body.latitude
    if body.longitude is not None:
        team.longitude = body.longitude
    team.status = TeamStatusEnum(body.status)

    await record_audit_event(
        db,
        action="team.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="response_team",
        entity_id=team.id,
        details={"old": old_data, "new": {"name": team.name, "contact": team.contact, "members_count": team.members_count, "status": team.status.value}},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(team)

    return await get_admin_team(id=team.id, db=db, current_user=current_user)


@router.patch("/resources/teams/{id}", response_model=AdminResponseTeamOut)
async def patch_admin_team(
    id: int,
    body: AdminResponseTeamPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(ResponseTeam).where(ResponseTeam.id == id)
    res = await db.execute(stmt)
    team = res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    changes = {}
    if body.status is not None:
        changes["status"] = {"old": team.status.value, "new": body.status}
        team.status = TeamStatusEnum(body.status)
        if body.status == "available":
            team.current_incident_id = None
    if body.contact is not None:
        team.contact = body.contact.strip() or None
        changes["contact"] = team.contact
    if body.members_count is not None:
        team.members_count = body.members_count
        changes["members_count"] = team.members_count
    if body.latitude is not None:
        team.latitude = body.latitude
    if body.longitude is not None:
        team.longitude = body.longitude

    await record_audit_event(
        db,
        action="team.patched",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="response_team",
        entity_id=team.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await get_admin_team(id=team.id, db=db, current_user=current_user)


@router.delete("/resources/teams/{id}")
async def delete_admin_team(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(ResponseTeam).where(ResponseTeam.id == id)
    res = await db.execute(stmt)
    team = res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    name = team.name
    await db.delete(team)
    await record_audit_event(
        db,
        action="team.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="response_team",
        entity_id=id,
        details={"name": name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Team '{name}' deleted successfully", "id": id}


# ── Vehicles CRUD & Patch ──────────────────────────────────────────

@router.get("/resources/vehicles", response_model=List[VehicleOut])
async def list_admin_vehicles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = (
        select(Vehicle)
        .options(selectinload(Vehicle.assigned_team), selectinload(Vehicle.current_incident))
        .order_by(Vehicle.name.asc())
    )
    res = await db.execute(stmt)
    vehicles = res.scalars().all()

    out = []
    for v in vehicles:
        team_name = v.assigned_team.name if v.assigned_team else None
        inc_code = v.current_incident.public_code if v.current_incident else None
        out.append(
            VehicleOut(
                id=v.id,
                name=v.name,
                type=v.type,
                plate=v.plate,
                status=v.status.value if hasattr(v.status, "value") else str(v.status),
                assigned_team_id=v.assigned_team_id,
                assigned_team_name=team_name,
                current_incident_id=v.current_incident_id,
                current_incident_code=inc_code,
                created_at=v.created_at,
            )
        )
    return out


@router.post("/resources/vehicles", response_model=VehicleOut, status_code=http_status.HTTP_201_CREATED)
async def create_admin_vehicle(
    body: VehicleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    existing = await db.execute(select(Vehicle).where(Vehicle.plate == body.plate.strip().upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A vehicle with this license plate already exists")

    veh = Vehicle(
        name=body.name.strip(),
        type=body.type.strip(),
        plate=body.plate.strip().upper(),
        status=VehicleStatusEnum(body.status),
        assigned_team_id=body.assigned_team_id,
    )
    db.add(veh)
    await db.commit()
    await db.refresh(veh)

    await record_audit_event(
        db,
        action="vehicle.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="vehicle",
        entity_id=veh.id,
        details={"name": veh.name, "plate": veh.plate, "type": veh.type, "status": veh.status.value},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return await get_admin_vehicle(id=veh.id, db=db, current_user=current_user)


@router.get("/resources/vehicles/{id}", response_model=VehicleOut)
async def get_admin_vehicle(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = (
        select(Vehicle)
        .options(selectinload(Vehicle.assigned_team), selectinload(Vehicle.current_incident))
        .where(Vehicle.id == id)
    )
    res = await db.execute(stmt)
    v = res.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    team_name = v.assigned_team.name if v.assigned_team else None
    inc_code = v.current_incident.public_code if v.current_incident else None
    return VehicleOut(
        id=v.id,
        name=v.name,
        type=v.type,
        plate=v.plate,
        status=v.status.value if hasattr(v.status, "value") else str(v.status),
        assigned_team_id=v.assigned_team_id,
        assigned_team_name=team_name,
        current_incident_id=v.current_incident_id,
        current_incident_code=inc_code,
        created_at=v.created_at,
    )


@router.put("/resources/vehicles/{id}", response_model=VehicleOut)
async def update_admin_vehicle(
    id: int,
    body: VehicleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Vehicle).where(Vehicle.id == id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    clean_plate = body.plate.strip().upper()
    if clean_plate != veh.plate:
        dup = await db.execute(select(Vehicle).where(Vehicle.plate == clean_plate, Vehicle.id != id))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="A vehicle with this license plate already exists")

    old_data = {"name": veh.name, "plate": veh.plate, "status": veh.status.value, "assigned_team_id": veh.assigned_team_id}
    veh.name = body.name.strip()
    veh.type = body.type.strip()
    veh.plate = clean_plate
    veh.status = VehicleStatusEnum(body.status)
    veh.assigned_team_id = body.assigned_team_id

    await record_audit_event(
        db,
        action="vehicle.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="vehicle",
        entity_id=veh.id,
        details={"old": old_data, "new": {"name": veh.name, "plate": veh.plate, "status": veh.status.value, "assigned_team_id": veh.assigned_team_id}},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await get_admin_vehicle(id=veh.id, db=db, current_user=current_user)


@router.patch("/resources/vehicles/{id}", response_model=VehicleOut)
async def patch_admin_vehicle(
    id: int,
    body: VehiclePatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Vehicle).where(Vehicle.id == id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    changes = {}
    if body.status is not None:
        changes["status"] = {"old": veh.status.value, "new": body.status}
        veh.status = VehicleStatusEnum(body.status)
        if body.status == "available":
            veh.current_incident_id = None
    if "assigned_team_id" in body.model_fields_set:
        changes["assigned_team_id"] = body.assigned_team_id
        veh.assigned_team_id = body.assigned_team_id
    if "current_incident_id" in body.model_fields_set:
        changes["current_incident_id"] = body.current_incident_id
        veh.current_incident_id = body.current_incident_id

    await record_audit_event(
        db,
        action="vehicle.patched",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="vehicle",
        entity_id=veh.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await get_admin_vehicle(id=veh.id, db=db, current_user=current_user)


@router.delete("/resources/vehicles/{id}")
async def delete_admin_vehicle(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Vehicle).where(Vehicle.id == id)
    res = await db.execute(stmt)
    veh = res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    name = veh.name
    await db.delete(veh)
    await record_audit_event(
        db,
        action="vehicle.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="vehicle",
        entity_id=id,
        details={"name": name, "plate": veh.plate},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Vehicle '{name}' deleted successfully", "id": id}


# ── Supplies CRUD & Patch ──────────────────────────────────────────

@router.get("/resources/supplies", response_model=List[SupplyOut])
async def list_admin_supplies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Supply).order_by(Supply.category.asc(), Supply.item.asc())
    res = await db.execute(stmt)
    supplies = res.scalars().all()

    out = []
    for s in supplies:
        cat_str = s.category.value if hasattr(s.category, "value") else str(s.category)
        out.append(
            SupplyOut(
                id=s.id,
                item=s.item,
                category=cat_str,
                quantity=s.quantity,
                unit=s.unit,
                low_stock_threshold=s.low_stock_threshold,
                location=s.location,
                is_low_stock=(s.quantity <= s.low_stock_threshold),
                created_at=s.created_at,
            )
        )
    return out


@router.post("/resources/supplies", response_model=SupplyOut, status_code=http_status.HTTP_201_CREATED)
async def create_admin_supply(
    body: SupplyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    supply = Supply(
        item=body.item.strip(),
        category=SupplyCategoryEnum(body.category),
        quantity=body.quantity,
        unit=body.unit.strip(),
        low_stock_threshold=body.low_stock_threshold,
        location=body.location.strip(),
    )
    db.add(supply)
    await db.commit()
    await db.refresh(supply)

    await record_audit_event(
        db,
        action="supply.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="supply",
        entity_id=supply.id,
        details={"item": supply.item, "quantity": supply.quantity, "category": supply.category.value},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return SupplyOut(
        id=supply.id,
        item=supply.item,
        category=supply.category.value,
        quantity=supply.quantity,
        unit=supply.unit,
        low_stock_threshold=supply.low_stock_threshold,
        location=supply.location,
        is_low_stock=(supply.quantity <= supply.low_stock_threshold),
        created_at=supply.created_at,
    )


@router.get("/resources/supplies/{id}", response_model=SupplyOut)
async def get_admin_supply(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Supply).where(Supply.id == id)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Supply item not found")

    cat_str = s.category.value if hasattr(s.category, "value") else str(s.category)
    return SupplyOut(
        id=s.id,
        item=s.item,
        category=cat_str,
        quantity=s.quantity,
        unit=s.unit,
        low_stock_threshold=s.low_stock_threshold,
        location=s.location,
        is_low_stock=(s.quantity <= s.low_stock_threshold),
        created_at=s.created_at,
    )


@router.put("/resources/supplies/{id}", response_model=SupplyOut)
async def update_admin_supply(
    id: int,
    body: SupplyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Supply).where(Supply.id == id)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Supply item not found")

    old_data = {"item": s.item, "quantity": s.quantity, "category": s.category.value, "location": s.location}
    s.item = body.item.strip()
    s.category = SupplyCategoryEnum(body.category)
    s.quantity = body.quantity
    s.unit = body.unit.strip()
    s.low_stock_threshold = body.low_stock_threshold
    s.location = body.location.strip()

    await record_audit_event(
        db,
        action="supply.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="supply",
        entity_id=s.id,
        details={"old": old_data, "new": {"item": s.item, "quantity": s.quantity, "category": s.category.value}},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(s)

    return await get_admin_supply(id=s.id, db=db, current_user=current_user)


@router.patch("/resources/supplies/{id}", response_model=SupplyOut)
async def patch_admin_supply(
    id: int,
    body: SupplyPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Supply).where(Supply.id == id)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Supply item not found")

    changes = {}
    old_qty = s.quantity
    if body.quantity is not None:
        s.quantity = max(0, body.quantity)
        changes["quantity"] = {"old": old_qty, "new": s.quantity}
    elif body.delta is not None:
        s.quantity = max(0, s.quantity + body.delta)
        changes["quantity"] = {"old": old_qty, "new": s.quantity, "delta": body.delta}

    if body.low_stock_threshold is not None:
        changes["low_stock_threshold"] = body.low_stock_threshold
        s.low_stock_threshold = body.low_stock_threshold

    await record_audit_event(
        db,
        action="supply.patched",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="supply",
        entity_id=s.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await get_admin_supply(id=s.id, db=db, current_user=current_user)


@router.delete("/resources/supplies/{id}")
async def delete_admin_supply(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Supply).where(Supply.id == id)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Supply item not found")

    item_name = s.item
    await db.delete(s)
    await record_audit_event(
        db,
        action="supply.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="supply",
        entity_id=id,
        details={"item": item_name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Supply item '{item_name}' deleted successfully", "id": id}


# ── Shelters CRUD & Patch ──────────────────────────────────────────

@router.get("/resources/shelters", response_model=List[ShelterOut])
async def list_admin_shelters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Place).where(Place.type == PlaceTypeEnum.shelter).order_by(Place.name.asc())
    res = await db.execute(stmt)
    shelters = res.scalars().all()

    out = []
    for s in shelters:
        cap = s.capacity or 1
        occ = s.current_occupancy or 0
        free = max(0, cap - occ)
        pct = round(min(100.0, (occ / cap) * 100), 1)
        out.append(
            ShelterOut(
                id=s.id,
                name=s.name,
                address=s.address,
                latitude=s.latitude,
                longitude=s.longitude,
                capacity=s.capacity,
                current_occupancy=occ,
                available=s.available,
                contact=s.contact,
                free_beds=free,
                occupancy_pct=pct,
                created_at=s.created_at,
            )
        )
    return out


@router.post("/resources/shelters", response_model=ShelterOut, status_code=http_status.HTTP_201_CREATED)
async def create_admin_shelter(
    body: ShelterCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    shelter = Place(
        type=PlaceTypeEnum.shelter,
        name=body.name.strip(),
        address=body.address.strip(),
        latitude=body.latitude,
        longitude=body.longitude,
        capacity=body.capacity,
        current_occupancy=body.current_occupancy,
        available=body.available,
        contact=body.contact.strip() if body.contact else None,
    )
    db.add(shelter)
    await db.commit()
    await db.refresh(shelter)

    await record_audit_event(
        db,
        action="shelter.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="shelter",
        entity_id=shelter.id,
        details={"name": shelter.name, "capacity": shelter.capacity, "occupancy": shelter.current_occupancy},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    cap = shelter.capacity or 1
    occ = shelter.current_occupancy or 0
    return ShelterOut(
        id=shelter.id,
        name=shelter.name,
        address=shelter.address,
        latitude=shelter.latitude,
        longitude=shelter.longitude,
        capacity=shelter.capacity,
        current_occupancy=occ,
        available=shelter.available,
        contact=shelter.contact,
        free_beds=max(0, cap - occ),
        occupancy_pct=round((occ / cap) * 100, 1),
        created_at=shelter.created_at,
    )


@router.get("/resources/shelters/{id}", response_model=ShelterOut)
async def get_admin_shelter(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Place).where(Place.id == id, Place.type == PlaceTypeEnum.shelter)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shelter not found")

    cap = s.capacity or 1
    occ = s.current_occupancy or 0
    return ShelterOut(
        id=s.id,
        name=s.name,
        address=s.address,
        latitude=s.latitude,
        longitude=s.longitude,
        capacity=s.capacity,
        current_occupancy=occ,
        available=s.available,
        contact=s.contact,
        free_beds=max(0, cap - occ),
        occupancy_pct=round(min(100.0, (occ / cap) * 100), 1),
        created_at=s.created_at,
    )


@router.put("/resources/shelters/{id}", response_model=ShelterOut)
async def update_admin_shelter(
    id: int,
    body: ShelterUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Place).where(Place.id == id, Place.type == PlaceTypeEnum.shelter)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shelter not found")

    old_data = {"name": s.name, "capacity": s.capacity, "occupancy": s.current_occupancy, "available": s.available}
    s.name = body.name.strip()
    s.address = body.address.strip()
    s.latitude = body.latitude
    s.longitude = body.longitude
    s.capacity = body.capacity
    s.current_occupancy = body.current_occupancy
    s.available = body.available
    s.contact = body.contact.strip() if body.contact else None

    await record_audit_event(
        db,
        action="shelter.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="shelter",
        entity_id=s.id,
        details={"old": old_data, "new": {"name": s.name, "capacity": s.capacity, "occupancy": s.current_occupancy}},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(s)

    return await get_admin_shelter(id=s.id, db=db, current_user=current_user)


@router.patch("/resources/shelters/{id}", response_model=ShelterOut)
async def patch_admin_shelter(
    id: int,
    body: ShelterPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Place).where(Place.id == id, Place.type == PlaceTypeEnum.shelter)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shelter not found")

    changes = {}
    if body.current_occupancy is not None:
        changes["current_occupancy"] = {"old": s.current_occupancy, "new": body.current_occupancy}
        s.current_occupancy = max(0, body.current_occupancy)
    elif body.delta_occupancy is not None:
        new_occ = max(0, s.current_occupancy + body.delta_occupancy)
        changes["current_occupancy"] = {"old": s.current_occupancy, "new": new_occ, "delta": body.delta_occupancy}
        s.current_occupancy = new_occ

    if body.capacity is not None:
        changes["capacity"] = {"old": s.capacity, "new": body.capacity}
        s.capacity = body.capacity

    if body.available is not None:
        changes["available"] = {"old": s.available, "new": body.available}
        s.available = body.available

    if body.contact is not None:
        s.contact = body.contact.strip() or None
        changes["contact"] = s.contact

    await record_audit_event(
        db,
        action="shelter.patched",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="shelter",
        entity_id=s.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await get_admin_shelter(id=s.id, db=db, current_user=current_user)


@router.delete("/resources/shelters/{id}")
async def delete_admin_shelter(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    stmt = select(Place).where(Place.id == id, Place.type == PlaceTypeEnum.shelter)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shelter not found")

    name = s.name
    await db.delete(s)
    await record_audit_event(
        db,
        action="shelter.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="shelter",
        entity_id=id,
        details={"name": name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Shelter '{name}' deleted successfully", "id": id}


# ── Combined Incident Resources Assignment & Release ───────────────

@router.post("/incidents/{id}/resources", response_model=IncidentAssignResourcesResponse)
async def assign_incident_resources(
    id: int,
    body: IncidentAssignResourcesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Assign a response team, vehicles and supplies to an incident in a single transaction.
    Validates availability, decrements stock, marks teams and vehicles as busy/in_use.
    """
    stmt = select(Incident).where(Incident.id == id)
    res = await db.execute(stmt)
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    team = None
    if body.team_id:
        team_res = await db.execute(select(ResponseTeam).where(ResponseTeam.id == body.team_id))
        team = team_res.scalar_one_or_none()
        if not team:
            raise HTTPException(status_code=404, detail=f"Response team #{body.team_id} not found")
        if team.status != TeamStatusEnum.available and team.current_incident_id != incident.id:
            raise HTTPException(
                status_code=400,
                detail=f"Team '{team.name}' is currently busy and cannot be assigned"
            )

    vehicles_to_assign = []
    if body.vehicle_ids:
        for vid in body.vehicle_ids:
            v_res = await db.execute(select(Vehicle).where(Vehicle.id == vid))
            v = v_res.scalar_one_or_none()
            if not v:
                raise HTTPException(status_code=404, detail=f"Vehicle #{vid} not found")
            if v.status != VehicleStatusEnum.available and v.current_incident_id != incident.id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Vehicle '{v.name}' ({v.plate}) is currently {v.status.value} and cannot be assigned"
                )
            vehicles_to_assign.append(v)

    supplies_to_allocate = []
    if body.supplies:
        for s_req in body.supplies:
            s_res = await db.execute(select(Supply).where(Supply.id == s_req.supply_id))
            sup = s_res.scalar_one_or_none()
            if not sup:
                raise HTTPException(status_code=404, detail=f"Supply item #{s_req.supply_id} not found")
            if sup.quantity < s_req.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for '{sup.item}'. Available: {sup.quantity} {sup.unit}, requested: {s_req.quantity}"
                )
            supplies_to_allocate.append((sup, s_req.quantity))

    # All checks passed — apply state mutations atomically
    allocated_supplies_info = []

    if team:
        team.status = TeamStatusEnum.busy
        team.current_incident_id = incident.id
        comp_team_res = await db.execute(select(Team).where(Team.name == team.name))
        comp_team = comp_team_res.scalar_one_or_none()
        if comp_team:
            comp_team.is_available = False
            db.add(Assignment(incident_id=incident.id, team_id=comp_team.id, assigned_by=current_user.id))

    for v in vehicles_to_assign:
        v.status = VehicleStatusEnum.in_use
        v.current_incident_id = incident.id
        if team and not v.assigned_team_id:
            v.assigned_team_id = team.id

    for sup, qty in supplies_to_allocate:
        sup.quantity -= qty
        alloc = IncidentSupplyAllocation(
            incident_id=incident.id,
            supply_id=sup.id,
            quantity=qty,
        )
        db.add(alloc)
        allocated_supplies_info.append({
            "supply_id": sup.id,
            "item": sup.item,
            "quantity": qty,
            "unit": sup.unit,
            "remaining_stock": sup.quantity,
        })

    if incident.status in [StatusEnum.reported, StatusEnum.under_review]:
        old_st = incident.status.value
        incident.status = StatusEnum.assigned
        db.add(
            StatusHistory(
                incident_id=incident.id,
                old_status=old_st,
                new_status="assigned",
                changed_by=current_user.id,
                note="Assigned response team and operational resources via resource management.",
            )
        )
        if incident.reporter_id:
            db.add(
                Notification(
                    user_id=incident.reporter_id,
                    incident_id=incident.id,
                    type="status_change",
                    title="Response Resources Dispatched",
                    message=f"Rescue team and equipment have been dispatched to incident {incident.public_code}.",
                )
            )

    audit_details = {
        "incident_code": incident.public_code,
        "team_id": team.id if team else None,
        "team_name": team.name if team else None,
        "vehicle_ids": [v.id for v in vehicles_to_assign],
        "supplies": allocated_supplies_info,
    }

    await record_audit_event(
        db,
        action="incident.resources_assigned",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="incident",
        entity_id=incident.id,
        details=audit_details,
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(incident)

    return IncidentAssignResourcesResponse(
        incident_id=incident.id,
        incident_status=incident.status.value,
        assigned_team_id=team.id if team else None,
        assigned_vehicle_ids=[v.id for v in vehicles_to_assign],
        allocated_supplies=allocated_supplies_info,
        message=f"Resources successfully dispatched and assigned to incident {incident.public_code}",
    )


@router.post("/incidents/{id}/resources/release", response_model=IncidentReleaseResourcesResponse)
async def release_incident_resources(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """
    Frees all response teams and vehicles allocated to this incident.
    Marks them as available and removes their current_incident_id.
    """
    stmt = select(Incident).where(Incident.id == id)
    res = await db.execute(stmt)
    incident = res.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    t_res = await db.execute(select(ResponseTeam).where(ResponseTeam.current_incident_id == incident.id))
    freed_teams = t_res.scalars().all()
    for t in freed_teams:
        t.status = TeamStatusEnum.available
        t.current_incident_id = None

    v_res = await db.execute(select(Vehicle).where(Vehicle.current_incident_id == incident.id))
    freed_veh = v_res.scalars().all()
    for v in freed_veh:
        v.status = VehicleStatusEnum.available
        v.current_incident_id = None

    await record_audit_event(
        db,
        action="incident.resources_released",
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        entity_type="incident",
        entity_id=incident.id,
        details={
            "incident_code": incident.public_code,
            "freed_teams_count": len(freed_teams),
            "freed_vehicles_count": len(freed_veh),
        },
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

    return IncidentReleaseResourcesResponse(
        incident_id=incident.id,
        freed_teams=len(freed_teams),
        freed_vehicles=len(freed_veh),
        message=f"Successfully freed {len(freed_teams)} team(s) and {len(freed_veh)} vehicle(s) from incident {incident.public_code}",
    )
