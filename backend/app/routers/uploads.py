"""
Upload router — StorageService-backed photo upload endpoints.

Endpoints
---------
POST /uploads/presign
    Returns upload target (local direct-upload or S3 presigned URL).
    Requires auth. Validates content_type and returns a random photo_key.

POST /uploads/direct
    Local-only: receives binary body and saves via LocalStorage.store_bytes().
    Requires auth + matching photo_key query param.
    Returns 404 when USE_AWS=True (browser uses S3 presigned URL instead).

GET /uploads/{photo_key:path}
    Serves a local file (LocalStorage) — owner or admin only.
    Returns 404 when USE_AWS=True (browser uses presigned download URL).
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Incident, User
from app.services.storage_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_BYTES,
    get_storage_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/uploads", tags=["uploads"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PresignRequest(BaseModel):
    content_type: str
    incident_id: int | None = None   # optional; 0 / None = pre-creation upload


class PresignResponse(BaseModel):
    upload_url: str
    photo_key:  str
    method:     str          # "PUT" (S3) or "POST" (local)
    expires_in: int
    max_bytes:  int
    fields:     dict = {}    # extra form fields for local POST


# ── POST /uploads/presign ──────────────────────────────────────────────────────

@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    body: PresignRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Returns an upload target for the given content_type.
    - LocalStorage:  { method="POST", upload_url="/uploads/direct", fields={key:...} }
    - S3Storage:     { method="PUT",  upload_url="<presigned S3 PUT URL>",  fields={} }

    photo_key is always a random opaque string — user filenames are never used.
    """
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported content type '{body.content_type}'. "
                f"Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}"
            ),
        )

    storage = get_storage_service()
    try:
        result = storage.presign_upload(
            incident_id=body.incident_id or 0,
            content_type=body.content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return PresignResponse(**result)


async def get_current_user_flexible(
    request: Request,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via Authorization header or ?token= query parameter."""
    auth_token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        auth_token = auth_header[7:].strip()
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    from app.auth import decode_access_token
    payload = decode_access_token(auth_token)
    if payload is None or payload.get("sub") is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── POST /uploads/direct  (LocalStorage only) ─────────────────────────────────

@router.post("/direct", status_code=status.HTTP_201_CREATED)
async def direct_upload(
    request: Request,
    key: str = Query(..., description="photo_key from /uploads/presign"),
    current_user: User = Depends(get_current_user_flexible),
):
    """
    Receives raw binary or multipart from the browser and persists it via LocalStorage.
    Only available when USE_AWS=False.
    """
    settings = get_settings()
    if settings.USE_AWS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Direct upload not available when USE_AWS=True. Use the S3 presigned URL.",
        )

    content_type = request.headers.get("content-type", "")
    ct_base = content_type.split(";")[0].strip().lower()

    if ct_base == "multipart/form-data":
        form = await request.form()
        upload_file = form.get("file")
        if upload_file is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file in form field 'file'.")
        ct_base = (upload_file.content_type or "").split(";")[0].strip().lower()
        if ct_base not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported content type '{ct_base}'. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
            )
        body_bytes = await upload_file.read()
    else:
        if ct_base not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported content type '{ct_base}'. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
            )
        body_bytes = await request.body()

    # Read body with size limit
    if len(body_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_BYTES // 1024 // 1024} MB.",
        )
    if len(body_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file body.",
        )

    storage = get_storage_service()
    try:
        stored_key = await storage.store_bytes(
            data=body_bytes,
            photo_key=key,
            content_type=ct_base,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.info(
        "[Upload] User %d uploaded %d bytes → key=%s",
        current_user.id, len(body_bytes), stored_key,
    )
    return {"photo_key": stored_key, "size": len(body_bytes)}


# ── GET /uploads/{photo_key:path}  (LocalStorage only) ────────────────────────

@router.get("/{photo_key:path}")
async def serve_upload(
    photo_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    """
    Serves a locally-stored photo.
    - Only the incident's reporter or an admin/responder may access the file.
    - Returns 404 when USE_AWS=True (use presigned download URL instead).
    """
    settings = get_settings()
    if settings.USE_AWS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Local file serving not available when USE_AWS=True. Use presigned download URL.",
        )

    # ── Authorisation: owner or admin/responder ─────────────────────────────
    result = await db.execute(
        select(Incident).where(Incident.photo_key == photo_key)
    )
    incident = result.scalar_one_or_none()

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if incident is not None:
        if role not in ["admin", "responder"] and incident.reporter_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorised to view this photo.",
            )
    else:
        # Photo not linked to an incident
        if role not in ["admin", "responder"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photo not found or not yet linked to an incident.",
            )

    # ── Serve file ──────────────────────────────────────────────────────────
    upload_dir = Path(settings.LOCAL_UPLOAD_DIR)
    file_path = (upload_dir / photo_key).resolve()

    # Directory traversal guard
    if not str(file_path).startswith(str(upload_dir.resolve())):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid photo key.")

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found. It may have been uploaded to a different storage backend.",
        )

    ext = file_path.suffix.lower().lstrip(".")
    media_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(path=str(file_path), media_type=media_type)
