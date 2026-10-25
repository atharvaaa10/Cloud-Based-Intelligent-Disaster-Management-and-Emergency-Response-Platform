"""
Places router — shelters, hospitals, relief supplies across Pune.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record_audit_event
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Place, PlaceTypeEnum, User
from app.schemas import PlaceCreate, PlaceOut

router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=list[PlaceOut])
async def list_places(
    type: Optional[str] = Query(None, pattern=r"^(shelter|hospital|relief_supply)$"),
    available_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """
    List disaster response places (shelters, hospitals, relief supply centers).
    Publicly accessible or authenticated.
    """
    query = select(Place)
    if type:
        query = query.where(Place.type == type)
    if available_only:
        query = query.where(Place.available.is_(True))
    query = query.order_by(Place.type, Place.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{place_id}", response_model=PlaceOut)
async def get_place(
    place_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific place."""
    result = await db.execute(select(Place).where(Place.id == place_id))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


@router.post("", response_model=PlaceOut, status_code=status.HTTP_201_CREATED)
async def create_place(
    body: PlaceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Create a new shelter, hospital, or supply center (admin only)."""
    place = Place(**body.model_dump())
    db.add(place)
    await db.flush()
    await db.refresh(place)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="place.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="place",
        entity_id=place.id,
        details={"name": place.name, "type": place.type.value if hasattr(place.type, "value") else str(place.type)},
        ip_address=client_ip,
    )
    await db.commit()
    return place


@router.put("/{place_id}", response_model=PlaceOut)
async def update_place(
    place_id: int,
    body: PlaceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Update place details (admin only)."""
    result = await db.execute(select(Place).where(Place.id == place_id))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    for k, v in body.model_dump().items():
        setattr(place, k, v)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="place.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="place",
        entity_id=place.id,
        details={"name": place.name, "capacity": place.capacity, "available": place.available},
        ip_address=client_ip,
    )
    await db.commit()
    await db.refresh(place)
    return place


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_place(
    place_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    """Delete a place (admin only)."""
    result = await db.execute(select(Place).where(Place.id == place_id))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="place.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="place",
        entity_id=place.id,
        details={"name": place.name},
        ip_address=client_ip,
    )
    await db.delete(place)
    await db.commit()
