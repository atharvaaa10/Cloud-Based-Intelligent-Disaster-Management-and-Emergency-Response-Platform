"""
Resources CRUD — admin only.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record_audit_event
from app.database import get_db
from app.deps import require_roles
from app.models import Resource, User
from app.schemas import ResourceCreate, ResourceOut

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=list[ResourceOut])
async def list_resources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Resource).order_by(Resource.id))
    return result.scalars().all()


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    body: ResourceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    resource = Resource(**body.model_dump())
    db.add(resource)
    await db.flush()
    await db.refresh(resource)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="resource.created",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="resource",
        entity_id=resource.id,
        details={"name": resource.name, "quantity": resource.quantity},
        ip_address=client_ip,
    )
    await db.commit()
    return resource


@router.get("/{resource_id}", response_model=ResourceOut)
async def get_resource(
    resource_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Resource).where(Resource.id == resource_id))
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


@router.put("/{resource_id}", response_model=ResourceOut)
async def update_resource(
    resource_id: int,
    body: ResourceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Resource).where(Resource.id == resource_id))
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    for key, value in body.model_dump().items():
        setattr(resource, key, value)
    await db.flush()
    await db.refresh(resource)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="resource.updated",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="resource",
        entity_id=resource.id,
        details={"name": resource.name, "quantity": resource.quantity, "is_available": resource.is_available},
        ip_address=client_ip,
    )
    await db.commit()
    return resource


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    result = await db.execute(select(Resource).where(Resource.id == resource_id))
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    resource_name = resource.name
    await db.delete(resource)
    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="resource.deleted",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        entity_type="resource",
        entity_id=resource_id,
        details={"name": resource_name},
        ip_address=client_ip,
    )
    await db.commit()
