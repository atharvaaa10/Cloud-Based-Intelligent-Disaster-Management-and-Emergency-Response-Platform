"""
StorageService — abstract interface for photo storage.

Two implementations:
  LocalStorage  — saves files to LOCAL_UPLOAD_DIR on disk. Used during local
                  development (USE_AWS=False). Serves files via GET /uploads/{key}.
  S3Storage     — issues presigned PUT/GET URLs via boto3. Enabled when USE_AWS=True.

The active implementation is chosen at startup via the factory `get_storage_service()`.
No other module needs to import boto3 or know about local paths.
"""

from __future__ import annotations

import abc
import logging
import pathlib
import uuid

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
}
MAX_FILE_BYTES: int = 5 * 1024 * 1024  # 5 MB


def _random_key(incident_id: int | None, ext: str) -> str:
    """
    Generate a random, opaque storage key.
    Format: incidents/{incident_id}/{uuid}.{ext}
    incident_id=0 is used for pre-creation uploads where the ID is not yet known.
    User-supplied filenames are NEVER used.
    """
    prefix = f"incidents/{incident_id}" if incident_id is not None else "incidents/pending"
    return f"{prefix}/{uuid.uuid4().hex}.{ext}"


# ── Abstract base ─────────────────────────────────────────────────────────────

class StorageService(abc.ABC):
    """Abstract storage interface — swap implementations without touching callers."""

    @abc.abstractmethod
    def presign_upload(
        self,
        *,
        incident_id: int | None,
        content_type: str,
        expires_in: int = 300,
    ) -> dict:
        """
        Return a dict describing where the browser should upload the file:
          {
            "upload_url":  str,   # URL the browser PUTs/POSTs to
            "photo_key":   str,   # opaque key stored in incidents.photo_key
            "method":      str,   # "PUT" (S3) or "POST" (local)
            "expires_in":  int,   # seconds until upload_url expires
            "max_bytes":   int,   # server-enforced size limit
            "fields":      dict,  # extra form fields (empty for PUT, used by POST)
          }
        """

    @abc.abstractmethod
    def presign_download(self, *, photo_key: str, expires_in: int = 300) -> str:
        """Return a URL the browser can GET to view the photo."""

    @abc.abstractmethod
    async def store_bytes(
        self,
        *,
        data: bytes,
        photo_key: str,
        content_type: str,
    ) -> str:
        """
        Direct server-side write (used by the local direct-upload endpoint).
        Returns the photo_key.
        """


# ── LocalStorage implementation ───────────────────────────────────────────────

class LocalStorage(StorageService):
    """
    Stores files on the local filesystem under LOCAL_UPLOAD_DIR.

    The browser POSTs the binary to POST /uploads/direct?key={photo_key}.
    The server reads it with UploadFile and saves it to disk.
    GET /uploads/{photo_key} serves the file (owner/admin only — enforced in the route).
    """

    def __init__(self, upload_dir: str):
        self.root = pathlib.Path(upload_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _abs_path(self, key: str) -> pathlib.Path:
        # Prevent directory traversal: resolve to canonical path under root
        target = (self.root / key).resolve()
        if not str(target).startswith(str(self.root.resolve())):
            raise ValueError(f"Invalid photo_key: {key!r}")
        return target

    def presign_upload(
        self,
        *,
        incident_id: int | None,
        content_type: str,
        expires_in: int = 300,
    ) -> dict:
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise ValueError(
                f"Unsupported content type '{content_type}'. "
                f"Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}"
            )
        ext = ALLOWED_CONTENT_TYPES[content_type]
        key = _random_key(incident_id, ext)
        upload_url = "/uploads/direct"
        logger.info("[LocalStorage] presign_upload key=%s", key)
        return {
            "upload_url": upload_url,
            "photo_key":  key,
            "method":     "POST",
            "expires_in": expires_in,
            "max_bytes":  MAX_FILE_BYTES,
            "fields":     {"key": key},
        }

    def presign_download(self, *, photo_key: str, expires_in: int = 300) -> str:
        return f"/uploads/{photo_key}"

    async def store_bytes(self, *, data: bytes, photo_key: str, content_type: str) -> str:
        abs_path = self._abs_path(photo_key)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(data)
        logger.info("[LocalStorage] Stored %d bytes at %s", len(data), abs_path)
        return photo_key


# ── S3Storage implementation ──────────────────────────────────────────────────

class S3Storage(StorageService):
    """
    Issues presigned S3 PUT/GET URLs via boto3.
    The browser uploads directly to S3 (PUT) — the server never touches the bytes.
    Enabled when USE_AWS=True in config.
    """

    def presign_upload(
        self,
        *,
        incident_id: int | None,
        content_type: str,
        expires_in: int = 300,
    ) -> dict:
        settings = get_settings()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise ValueError(
                f"Unsupported content type '{content_type}'. "
                f"Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}"
            )
        ext = ALLOWED_CONTENT_TYPES[content_type]
        key = _random_key(incident_id, ext)
        bucket = settings.S3_BUCKET_NAME or "disaster-response-photos"
        try:
            from app.aws_services import get_s3_client
            s3 = get_s3_client()
            url = s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
                ExpiresIn=expires_in,
            )
        except Exception as exc:
            logger.warning("[S3Storage] Presign PUT fallback stub: %s", exc)
            url = f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}?stub_upload=true"

        logger.info("[S3Storage] presign_upload key=%s bucket=%s", key, bucket)
        return {
            "upload_url": url,
            "photo_key":  key,
            "method":     "PUT",
            "expires_in": expires_in,
            "max_bytes":  MAX_FILE_BYTES,
            "fields":     {},
        }

    def presign_download(self, *, photo_key: str, expires_in: int = 300) -> str:
        settings = get_settings()
        bucket = settings.S3_BUCKET_NAME or "disaster-response-photos"
        try:
            from app.aws_services import get_s3_client
            s3 = get_s3_client()
            return s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": bucket, "Key": photo_key},
                ExpiresIn=expires_in,
            )
        except Exception as exc:
            logger.warning("[S3Storage] Presign GET fallback stub: %s", exc)
            return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{photo_key}?stub_download=true"

    async def store_bytes(self, *, data: bytes, photo_key: str, content_type: str) -> str:
        from app.aws_services import get_s3_client
        settings = get_settings()
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.S3_BUCKET_NAME or "disaster-response-photos",
            Key=photo_key,
            Body=data,
            ContentType=content_type,
        )
        return photo_key


# ── Factory ───────────────────────────────────────────────────────────────────

def get_storage_service() -> StorageService:
    """
    Returns the active StorageService implementation.
    Controlled by USE_AWS env flag — no code change required to switch.
    """
    settings = get_settings()
    if settings.USE_AWS:
        logger.debug("[StorageService] Using S3Storage (USE_AWS=True)")
        return S3Storage()
    else:
        upload_dir = getattr(settings, "LOCAL_UPLOAD_DIR", "uploads")
        logger.debug("[StorageService] Using LocalStorage dir=%s", upload_dir)
        return LocalStorage(upload_dir=upload_dir)
