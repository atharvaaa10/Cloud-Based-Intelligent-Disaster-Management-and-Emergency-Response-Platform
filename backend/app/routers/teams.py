"""
Teams CRUD — admin only.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record_audit_event
from app.database import get_db
from app.deps import require_roles
from app.models import Team, User
from app.schemas import TeamCreate, TeamOut

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
async def list_teams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "responder")),
):
    result = await db.execute(select(Team).order_by(Team.id))
    return result.scalars().all()


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    team = Team(**body.model_dump())
    db.add(team)
    await db.flush()
    await db.refresh(team)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="team.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="team",
        entity_id=team.id,
        details={"name": team.name, "type": team.type.value if hasattr(team.type, "value") else str(team.type)},
        ip_address=client_ip,
    )
    await db.commit()
    return team


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "responder")),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.put("/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: int,
    body: TeamCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    for key, value in body.model_dump().items():
        setattr(team, key, value)
    await db.flush()
    await db.refresh(team)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="team.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="team",
        entity_id=team.id,
        details={"name": team.name, "is_available": team.is_available},
        ip_address=client_ip,
    )
    await db.commit()
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    team_name = team.name
    await db.delete(team)
    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="team.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="team",
        entity_id=team_id,
        details={"name": team_name},
        ip_address=client_ip,
    )
    await db.commit()
