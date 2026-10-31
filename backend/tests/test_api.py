"""
Tests for auth, incident creation, and assignment flow.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────

async def register_user(client: AsyncClient, name="Test", email="test@test.com", password="test123"):
    return await client.post("/auth/register", json={"name": name, "email": email, "password": password})


async def login_user(client: AsyncClient, email="test@test.com", password="test123"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


async def register_and_login(client: AsyncClient, name="Test", email="test@test.com", password="test123"):
    await register_user(client, name, email, password)
    return await login_user(client, email, password)


def auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


# ── Auth Tests ────────────────────────────────────────────────

async def test_register_success(client: AsyncClient):
    resp = await register_user(client, "Alice", "alice@test.com", "alice123")
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "alice@test.com"
    assert data["role"] == "citizen"


async def test_register_duplicate_email(client: AsyncClient):
    await register_user(client, "Bob", "bob@test.com", "bob12345")
    resp = await register_user(client, "Bob2", "bob@test.com", "bob12345")
    assert resp.status_code == 400


async def test_login_success(client: AsyncClient):
    await register_user(client, "Carol", "carol@test.com", "carol123")
    resp = await client.post("/auth/login", json={"email": "carol@test.com", "password": "carol123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_login_wrong_password(client: AsyncClient):
    await register_user(client, "Dave", "dave@test.com", "dave1234")
    resp = await client.post("/auth/login", json={"email": "dave@test.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_me_endpoint(client: AsyncClient):
    token = await register_and_login(client, "Eve", "eve@test.com", "eve12345")
    resp = await client.get("/auth/me", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "eve@test.com"


# ── Incident Tests ────────────────────────────────────────────

INCIDENT_PAYLOAD = {
    "category": "rescue",
    "description": "Flooding in test area, need urgent rescue boats.",
    "location_text": "Test Area, Pune",
    "people_affected": 10,
}


async def test_create_incident(client: AsyncClient):
    token = await register_and_login(client, "Reporter", "reporter@test.com", "rep12345")
    resp = await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(token))
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "rescue"
    assert data["status"] == "reported"


async def test_my_incidents(client: AsyncClient):
    token = await register_and_login(client, "Reporter2", "reporter2@test.com", "rep12345")
    await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(token))
    resp = await client.get("/incidents/mine", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_citizen_cannot_list_all(client: AsyncClient):
    token = await register_and_login(client, "Citizen", "citizen2@test.com", "cit12345")
    resp = await client.get("/incidents", headers=auth_header(token))
    assert resp.status_code == 403


# ── Assignment Tests (requires admin) ─────────────────────────

async def test_create_incident_requires_auth(client: AsyncClient):
    resp = await client.post("/incidents", json=INCIDENT_PAYLOAD)
    assert resp.status_code == 401


# ── Assignment & Status Flow Tests ───────────────────────────

from tests.conftest import async_session_test
from app.models import User, RoleEnum
from app.auth import create_access_token, hash_password


async def create_user_with_role(role: RoleEnum, name: str, email: str) -> str:
    async with async_session_test() as session:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password("password123"),
            role=role,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return create_access_token({"sub": str(user.id), "role": user.role.value})


async def test_admin_assigns_team_and_flow(client: AsyncClient):
    # 1. Prepare roles
    admin_token = await create_user_with_role(RoleEnum.admin, "Admin", "admin_flow@test.com")
    citizen_token = await register_and_login(client, "Citizen User", "citizen_flow@test.com", "cit12345")

    # 2. Admin creates a rescue team
    team_resp = await client.post(
        "/teams",
        json={"name": "Alpha Rescue Squad", "type": "rescue", "contact": "+91-9876543210", "is_available": True},
        headers=auth_header(admin_token),
    )
    assert team_resp.status_code == 201
    team_id = team_resp.json()["id"]
    assert team_resp.json()["is_available"] is True

    # 3. Citizen reports an emergency
    inc_resp = await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(citizen_token))
    assert inc_resp.status_code == 201
    incident_id = inc_resp.json()["id"]
    assert inc_resp.json()["status"] == "reported"

    # 4. Citizen cannot assign team (requires admin)
    forbidden_assign = await client.post(
        f"/incidents/{incident_id}/assign",
        json={"team_id": team_id},
        headers=auth_header(citizen_token),
    )
    assert forbidden_assign.status_code == 403

    # 5. Admin assigns the team
    assign_resp = await client.post(
        f"/incidents/{incident_id}/assign",
        json={"team_id": team_id},
        headers=auth_header(admin_token),
    )
    assert assign_resp.status_code == 201

    # Verify team is now marked unavailable
    team_check = await client.get(f"/teams/{team_id}", headers=auth_header(admin_token))
    assert team_check.status_code == 200
    assert team_check.json()["is_available"] is False

    # 6. Admin moves status to in_progress (citizen gets 403)
    forbidden_status = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "in_progress", "note": "Citizen trying to change status"},
        headers=auth_header(citizen_token),
    )
    assert forbidden_status.status_code == 403

    progress_resp = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "in_progress", "note": "Team deployed on site"},
        headers=auth_header(admin_token),
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["status"] == "in_progress"

    # 7. Admin resolves incident -> team freed
    resolve_resp = await client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "resolved", "note": "All citizens safely evacuated"},
        headers=auth_header(admin_token),
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "resolved"

    team_freed = await client.get(f"/teams/{team_id}", headers=auth_header(admin_token))
    assert team_freed.json()["is_available"] is True

    # 8. Citizen views their incident detail with full history timeline
    detail_resp = await client.get(f"/incidents/{incident_id}", headers=auth_header(citizen_token))
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "resolved"
    assert len(detail["status_history"]) >= 2
    assert len(detail["assignments"]) == 1


# ── Phase 2: Monitoring, Health, & S3 Photo Tests ────────────

async def test_health_check_endpoint(client: AsyncClient):
    """GET /health must return 200 and DB connectivity status without auth."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "environment" in data
    assert "aws_enabled" in data


async def test_photo_presigned_upload_and_download_stub_mode(client: AsyncClient):
    """With USE_AWS=false, photo endpoints return mock presigned URLs and store photo_key."""
    token = await register_and_login(client, "Photo Reporter", "photo_rep@test.com", "Photo123")

    # 1. Request presigned upload URL for a new incident
    upload_req = await client.post(
        "/incidents/photo-upload-url",
        json={"filename": "flooding_drone.jpg", "content_type": "image/jpeg"},
        headers=auth_header(token),
    )
    assert upload_req.status_code == 200
    upload_data = upload_req.json()
    assert "upload_url" in upload_data
    assert upload_data["photo_key"].startswith("incidents/")
    assert upload_data["photo_key"].endswith(".jpg")
    assert upload_data["expires_in"] == 300
    assert upload_data["max_bytes"] == 5 * 1024 * 1024

    photo_key = upload_data["photo_key"]

    # 2. Create incident with the generated photo_key
    inc_payload = {
        **INCIDENT_PAYLOAD,
        "description": "Severe flooding captured via drone camera",
        "photo_key": photo_key,
    }
    create_resp = await client.post("/incidents", json=inc_payload, headers=auth_header(token))
    assert create_resp.status_code == 201
    incident_id = create_resp.json()["id"]
    assert create_resp.json()["photo_key"] == photo_key

    # 3. Request presigned download URL as the incident owner
    download_req = await client.get(f"/incidents/{incident_id}/photo-url", headers=auth_header(token))
    assert download_req.status_code == 200
    download_data = download_req.json()
    assert "photo_url" in download_data
    assert download_data["photo_key"] == photo_key


async def test_photo_upload_url_rejects_unsupported_content_type(client: AsyncClient):
    """Only image/jpeg, image/png, and image/webp are permitted."""
    token = await register_and_login(client, "PDF User", "pdf_user@test.com", "pass12345")
    bad_req = await client.post(
        "/incidents/photo-upload-url",
        json={"filename": "document.pdf", "content_type": "application/pdf"},
        headers=auth_header(token),
    )
    assert bad_req.status_code in (400, 422)


async def test_photo_url_rbac_permissions(client: AsyncClient):
    """Only incident owner or admin can access photo-url."""
    owner_token = await register_and_login(client, "Photo Owner", "owner_pic@test.com", "pic12345")
    other_citizen_token = await register_and_login(client, "Other Citizen", "other_cit@test.com", "cit12345")
    admin_token = await create_user_with_role(RoleEnum.admin, "Photo Admin", "admin_pic@test.com")

    # Create incident with photo_key
    inc_resp = await client.post(
        "/incidents",
        json={**INCIDENT_PAYLOAD, "photo_key": "incidents/123/proof.png"},
        headers=auth_header(owner_token),
    )
    incident_id = inc_resp.json()["id"]

    # 1. Other citizen cannot access photo URL
    forbidden = await client.get(f"/incidents/{incident_id}/photo-url", headers=auth_header(other_citizen_token))
    assert forbidden.status_code == 403

    # 2. Owner can access
    owner_access = await client.get(f"/incidents/{incident_id}/photo-url", headers=auth_header(owner_token))
    assert owner_access.status_code == 200

    # 3. Admin can access
    admin_access = await client.get(f"/incidents/{incident_id}/photo-url", headers=auth_header(admin_token))
    assert admin_access.status_code == 200


async def test_photo_upload_url_for_existing_incident(client: AsyncClient):
    """POST /incidents/{id}/photo-upload-url creates key scoped to that incident id and saves to DB."""
    token = await register_and_login(client, "Late Uploader", "late_up@test.com", "late12345")
    inc_resp = await client.post("/incidents", json=INCIDENT_PAYLOAD, headers=auth_header(token))
    incident_id = inc_resp.json()["id"]

    upload_req = await client.post(
        f"/incidents/{incident_id}/photo-upload-url",
        json={"filename": "damage_aftermath.webp", "content_type": "image/webp"},
        headers=auth_header(token),
    )
    assert upload_req.status_code == 200
    upload_data = upload_req.json()
    assert upload_data["photo_key"].startswith(f"incidents/{incident_id}/")
    assert upload_data["photo_key"].endswith(".webp")

    # Check incident detail has updated photo_key
    detail_resp = await client.get(f"/incidents/{incident_id}", headers=auth_header(token))
    assert detail_resp.json()["photo_key"] == upload_data["photo_key"]


async def test_boto3_s3_presigned_urls_with_moto(monkeypatch):
    """Test real boto3 presigned URL generation using moto[s3] when USE_AWS=true."""
    import boto3
    from moto import mock_aws
    from app.aws_services import generate_presigned_upload_url, generate_presigned_download_url
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "USE_AWS", True)
    monkeypatch.setattr(settings, "S3_BUCKET_NAME", "disaster-platform-test-bucket")
    monkeypatch.setattr(settings, "AWS_REGION", "us-east-1")

    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        test_bucket = "disaster-platform-test-bucket"
        s3.create_bucket(Bucket=test_bucket)

        # 1. Test presigned upload PUT URL
        upload_res = generate_presigned_upload_url(
            incident_id=42,
            content_type="image/png",
            file_ext="png",
        )
        assert upload_res["photo_key"].startswith("incidents/42/")
        assert upload_res["photo_key"].endswith(".png")
        assert "upload_url" in upload_res
        assert test_bucket in upload_res["upload_url"]
        assert "Signature=" in upload_res["upload_url"] or "X-Amz-Signature=" in upload_res["upload_url"]

        # 2. Test presigned download GET URL
        download_url = generate_presigned_download_url(
            key=upload_res["photo_key"],
        )
        assert test_bucket in download_url
        assert "Signature=" in download_url or "X-Amz-Signature=" in download_url


async def test_production_configuration_validation():
    """Test production settings safety validation."""
    from pydantic import ValidationError
    from app.config import Settings

    # 1. Default insecure secret key must fail in production
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            ENV="production",
            SECRET_KEY="disaster-insecure-dev-secret-key-change-in-prod",
            DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
        )
    assert "In production (ENV=production), a strong, custom SECRET_KEY must be configured" in str(exc_info.value)

    # 2. Missing S3_BUCKET_NAME when USE_AWS=true in production must fail
    with pytest.raises(ValidationError) as exc_info_s3:
        Settings(
            _env_file=None,
            ENV="production",
            SECRET_KEY="my-production-secret-token-32-chars-long",
            USE_AWS=True,
            S3_BUCKET_NAME="",
            DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
        )
    assert "S3_BUCKET_NAME must be set when USE_AWS=true in production" in str(exc_info_s3.value)

    # 3. Valid production configuration passes
    prod_settings = Settings(
        _env_file=None,
        ENV="production",
        SECRET_KEY="my-production-secret-token-32-chars-long",
        USE_AWS=True,
        S3_BUCKET_NAME="production-disaster-bucket",
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
    )
    assert prod_settings.ENV == "production"
    assert prod_settings.USE_AWS is True


async def test_seed_refuses_demo_passwords_in_production(monkeypatch):
    """Seed script must refuse to run demo credentials when ENV=production."""
    from app.config import get_settings
    from app.seed import seed_data

    settings = get_settings()
    monkeypatch.setattr(settings, "ENV", "production")

    with pytest.raises(RuntimeError) as exc_info:
        await seed_data()
    assert "Refusing to seed default demo passwords in ENV=production" in str(exc_info.value)


