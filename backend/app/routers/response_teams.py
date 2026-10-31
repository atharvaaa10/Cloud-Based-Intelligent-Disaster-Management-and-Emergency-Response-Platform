"""
Response teams router — field teams, GPS coordinates, and deployment status.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record_audit_event
from app.database import get_db
from app.deps import require_roles
from app.models import ResponseTeam, TeamStatusEnum, User
from app.schemas import ResponseTeamCreate, ResponseTeamOut, ResponseTeamStatusUpdate

router = APIRouter(prefix="/response-teams", tags=["response-teams"])


@router.get("", response_model=list[ResponseTeamOut])
async def list_response_teams(
    status: Optional[str] = Query(None, pattern=r"^(available|busy)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """List all response teams, optionally filtered by availability status."""
    query = select(ResponseTeam)
    if status:
        query = query.where(ResponseTeam.status == status)
    query = query.order_by(ResponseTeam.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{team_id}", response_model=ResponseTeamOut)
async def get_response_team(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Get single response team details."""
    result = await db.execute(select(ResponseTeam).where(ResponseTeam.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Response team not found")
    return team


@router.post("", response_model=ResponseTeamOut, status_code=status.HTTP_201_CREATED)
async def create_response_team(
    body: ResponseTeamCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Register a new response team (admin only)."""
    team = ResponseTeam(**body.model_dump())
    db.add(team)
    await db.flush()
    await db.refresh(team)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="response_team.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="response_team",
        entity_id=team.id,
        details={"name": team.name, "status": team.status.value if hasattr(team.status, "value") else str(team.status)},
        ip_address=client_ip,
    )
    await db.commit()
    return team


@router.patch("/{team_id}/status", response_model=ResponseTeamOut)
async def update_response_team_status(
    team_id: int,
    body: ResponseTeamStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Update team status (available vs busy)."""
    result = await db.execute(select(ResponseTeam).where(ResponseTeam.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Response team not found")

    old_status = team.status.value if hasattr(team.status, "value") else str(team.status)
    team.status = body.status

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="response_team.status_updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="response_team",
        entity_id=team.id,
        details={"old_status": old_status, "new_status": body.status},
        ip_address=client_ip,
    )
    await db.commit()
    await db.refresh(team)
    return team
