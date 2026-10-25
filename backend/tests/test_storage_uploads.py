"""
Tests for photo upload flow and StorageService abstraction.

Requirements covered:
- StorageService interface with LocalStorage (now) and S3Storage with presigned URLs (stub)
- Switched via USE_AWS flag / factory
- POST /uploads/presign: returns upload target and random object key (never user filename)
- Content type validation (JPEG/PNG/WebP allowed, others rejected with 400)
- Size validation (max 5 MB enforced, > 5 MB rejected with 413)
- POST /uploads/direct: local binary / multipart upload storing bytes safely
- POST /incidents: saves only photo_key
- Access control: photo URL and photo file accessible ONLY to incident owner and admins
  (other citizens get 403 Forbidden)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import get_settings
from app.models import Incident, RoleEnum, User
from app.services.storage_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_BYTES,
    LocalStorage,
    S3Storage,
    get_storage_service,
)
from tests.test_api import auth_header, create_user_with_role, register_and_login

VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
VALID_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100


# ── 1. StorageService unit tests ──────────────────────────────────────────────

def test_storage_service_factory_local(monkeypatch):
    """When USE_AWS=False, get_storage_service() returns LocalStorage."""
    settings = get_settings()
    monkeypatch.setattr(settings, "USE_AWS", False)
    storage = get_storage_service()
    assert isinstance(storage, LocalStorage)


def test_storage_service_factory_s3(monkeypatch):
    """When USE_AWS=True, get_storage_service() returns S3Storage."""
    settings = get_settings()
    monkeypatch.setattr(settings, "USE_AWS", True)
    storage = get_storage_service()
    assert isinstance(storage, S3Storage)


def test_local_storage_presign_and_random_key(tmp_path):
    """LocalStorage.presign_upload returns random opaque key, never user filenames."""
    storage = LocalStorage(upload_dir=str(tmp_path))
    res = storage.presign_upload(incident_id=0, content_type="image/jpeg")

    assert res["method"] == "POST"
    assert res["upload_url"] == "/uploads/direct"
    assert res["max_bytes"] == MAX_FILE_BYTES
    key = res["photo_key"]
    assert key.startswith("incidents/0/")
    assert key.endswith(".jpg")
    # Must not contain user filenames or arbitrary paths
    assert ".." not in key

    # Unsupported content type raises ValueError
    with pytest.raises(ValueError, match="Unsupported content type"):
        storage.presign_upload(incident_id=0, content_type="application/pdf")


def test_local_storage_path_traversal_guard(tmp_path):
    """LocalStorage._abs_path blocks path traversal attempts."""
    storage = LocalStorage(upload_dir=str(tmp_path))
    with pytest.raises(ValueError, match="Invalid photo_key"):
        storage._abs_path("../../../etc/passwd")


def test_s3_storage_stub_presign(monkeypatch):
    """S3Storage.presign_upload returns PUT method and presigned S3 URL (or stub)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "USE_AWS", True)
    storage = S3Storage()
    res = storage.presign_upload(incident_id=123, content_type="image/png")

    assert res["method"] == "PUT"
    assert "upload_url" in res
    assert res["photo_key"].startswith("incidents/123/")
    assert res["photo_key"].endswith(".png")

    download_url = storage.presign_download(photo_key=res["photo_key"])
    assert "s3" in download_url or "amazonaws.com" in download_url


# ── 2. POST /uploads/presign endpoint tests ───────────────────────────────────

@pytest.mark.asyncio
async def test_presign_requires_auth(client: AsyncClient):
    """Unauthenticated call to /uploads/presign returns 401."""
    resp = await client.post("/uploads/presign", json={"content_type": "image/jpeg"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_presign_validates_content_type(client: AsyncClient):
    """Only JPEG, PNG, and WebP are allowed."""
    token = await register_and_login(client, "Upload User", "uploader1@test.com", "Secret123")
    headers = auth_header(token)

    # Valid types
    for ct in ["image/jpeg", "image/png", "image/webp"]:
        resp = await client.post("/uploads/presign", json={"content_type": ct}, headers=headers)
        assert resp.status_code == 200, f"Failed for {ct}: {resp.text}"
        data = resp.json()
        assert "upload_url" in data
        assert "photo_key" in data
        assert data["method"] in ("POST", "PUT")
        assert data["max_bytes"] == 5 * 1024 * 1024

    # Invalid types
    for bad_ct in ["application/pdf", "image/gif", "text/plain", "image/svg+xml"]:
        resp = await client.post("/uploads/presign", json={"content_type": bad_ct}, headers=headers)
        assert resp.status_code == 400


# ── 3. POST /uploads/direct endpoint tests ────────────────────────────────────

@pytest.mark.asyncio
async def test_direct_upload_enforces_size_limit(client: AsyncClient):
    """Payloads exceeding 5 MB are rejected with 413."""
    token = await register_and_login(client, "Big File User", "bigfile@test.com", "Secret123")
    headers = auth_header(token)

    # 1. Presign
    presign_resp = await client.post("/uploads/presign", json={"content_type": "image/jpeg"}, headers=headers)
    assert presign_resp.status_code == 200
    photo_key = presign_resp.json()["photo_key"]

    # 2. Upload 5MB + 1 byte
    too_large = b"x" * (MAX_FILE_BYTES + 1)
    upload_headers = {**headers, "Content-Type": "image/jpeg"}
    resp = await client.post(
        f"/uploads/direct?key={photo_key}",
        content=too_large,
        headers=upload_headers,
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_direct_upload_rejects_empty_body(client: AsyncClient):
    """Empty file bodies are rejected with 400."""
    token = await register_and_login(client, "Empty File User", "emptyfile@test.com", "Secret123")
    headers = auth_header(token)

    presign_resp = await client.post("/uploads/presign", json={"content_type": "image/jpeg"}, headers=headers)
    photo_key = presign_resp.json()["photo_key"]

    upload_headers = {**headers, "Content-Type": "image/jpeg"}
    resp = await client.post(
        f"/uploads/direct?key={photo_key}",
        content=b"",
        headers=upload_headers,
    )
    assert resp.status_code == 400


# ── 4. End-to-end flow & RBAC photo access control ────────────────────────────

@pytest.mark.asyncio
async def test_full_incident_photo_upload_and_access_control(client: AsyncClient):
    """
    Complete flow:
    1. Citizen requests upload target via POST /uploads/presign
    2. Citizen uploads file via POST /uploads/direct
    3. Citizen posts incident storing only photo_key
    4. Incident owner can fetch photo URL via GET /incidents/{id}/photo-url
    5. Incident owner can fetch image file via GET /uploads/{photo_key}
    6. Admin can fetch photo URL and file
    7. Another citizen gets 403 Forbidden for both photo-url and file
    """
    owner_token = await register_and_login(client, "Incident Owner", "owner_incident@test.com", "Secret123")
    other_token = await register_and_login(client, "Other Citizen", "other_incident@test.com", "Secret123")
    admin_token = await create_user_with_role(RoleEnum.admin, "Photo Admin", "admin_photo@test.com")

    # Step 1: Request presign
    presign_resp = await client.post(
        "/uploads/presign",
        json={"content_type": "image/jpeg"},
        headers=auth_header(owner_token),
    )
    assert presign_resp.status_code == 200
    presign_data = presign_resp.json()
    photo_key = presign_data["photo_key"]

    # Step 2: Upload photo bytes
    upload_resp = await client.post(
        f"/uploads/direct?key={photo_key}",
        content=VALID_JPEG_BYTES,
        headers={**auth_header(owner_token), "Content-Type": "image/jpeg"},
    )
    assert upload_resp.status_code == 201
    assert upload_resp.json()["photo_key"] == photo_key

    # Step 3: Create incident with photo_key
    create_resp = await client.post(
        "/incidents",
        json={
            "category": "rescue",
            "description": "Rising floodwaters trapped 3 elderly citizens on roof.",
            "location_text": "Shivajinagar near Pune station",
            "latitude": 18.5314,
            "longitude": 73.8446,
            "people_affected": 3,
            "photo_key": photo_key,
        },
        headers=auth_header(owner_token),
    )
    assert create_resp.status_code == 201
    incident_id = create_resp.json()["id"]
    assert create_resp.json()["photo_key"] == photo_key

    # Step 4: Owner accesses photo-url -> 200
    owner_url_resp = await client.get(
        f"/incidents/{incident_id}/photo-url",
        headers=auth_header(owner_token),
    )
    assert owner_url_resp.status_code == 200
    assert owner_url_resp.json()["photo_key"] == photo_key
    photo_url = owner_url_resp.json()["photo_url"]
    assert photo_url == f"/uploads/{photo_key}"

    # Step 5: Owner fetches photo file -> 200
    owner_file_resp = await client.get(
        photo_url,
        headers=auth_header(owner_token),
    )
    assert owner_file_resp.status_code == 200
    assert owner_file_resp.content == VALID_JPEG_BYTES
    assert owner_file_resp.headers["content-type"] == "image/jpeg"

    # Also works via ?token= query parameter (for <img src="..."> tags)
    owner_query_resp = await client.get(f"{photo_url}?token={owner_token}")
    assert owner_query_resp.status_code == 200
    assert owner_query_resp.content == VALID_JPEG_BYTES

    # Step 6: Admin accesses photo-url and file -> 200
    admin_url_resp = await client.get(
        f"/incidents/{incident_id}/photo-url",
        headers=auth_header(admin_token),
    )
    assert admin_url_resp.status_code == 200

    admin_file_resp = await client.get(
        photo_url,
        headers=auth_header(admin_token),
    )
    assert admin_file_resp.status_code == 200
    assert admin_file_resp.content == VALID_JPEG_BYTES

    # Step 7: Other citizen attempts to access photo-url -> 403 Forbidden
    other_url_resp = await client.get(
        f"/incidents/{incident_id}/photo-url",
        headers=auth_header(other_token),
    )
    assert other_url_resp.status_code == 403

    # Other citizen attempts to access photo file -> 403 Forbidden
    other_file_resp = await client.get(
        photo_url,
        headers=auth_header(other_token),
    )
    assert other_file_resp.status_code == 403
