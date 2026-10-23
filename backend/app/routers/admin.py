"""
Administrative routes — access strictly restricted to admin users.
Audit logging queries, operational system inspection, and admin reports.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import require_roles
from app.models import AuditLog, User
from app.schemas import AuditLogListResponse, AuditLogOut

router = APIRouter(prefix="/admin", tags=["admin"])


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
