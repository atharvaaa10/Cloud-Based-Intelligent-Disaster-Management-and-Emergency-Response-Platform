"""
Pydantic schemas for request / response validation.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ── Auth ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    role: str
    created_at: datetime


# ── Incident ─────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    category: str = Field(..., pattern=r"^(rescue|medical|food_water|shelter|other)$")
    description: str = Field(..., min_length=10, max_length=2000)
    location_text: str = Field(..., min_length=3, max_length=300)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    people_affected: int = Field(default=1, ge=1)
    photo_key: Optional[str] = None


class PhotoUploadRequest(BaseModel):
    content_type: str = Field(..., pattern=r"^(image/jpeg|image/png|image/webp)$")
    file_ext: Optional[str] = Field(default=None, max_length=10)


class PhotoUploadResponse(BaseModel):
    upload_url: str
    photo_key: str
    expires_in: int = 300
    max_bytes: int = 5 * 1024 * 1024


class PhotoDownloadResponse(BaseModel):
    photo_url: str
    photo_key: str


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reporter_id: int
    category: str
    description: str
    location_text: str
    latitude: Optional[float]
    longitude: Optional[float]
    people_affected: int
    priority: str
    status: str
    photo_key: Optional[str]
    triage_score: Optional[int] = None
    triage_reason: Optional[str] = None
    auto_triaged_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class IncidentTriageRequest(BaseModel):
    priority: str = Field(..., pattern=r"^(low|medium|high|critical)$")
    triage_reason: str = Field(..., min_length=3, max_length=1000)
    score: int = Field(..., ge=0, le=200)


class IncidentDetail(IncidentOut):
    reporter: Optional[UserOut] = None
    assignments: list = []
    status_history: list = []


class PriorityUpdate(BaseModel):
    priority: str = Field(..., pattern=r"^(low|medium|high|critical)$")


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(reported|assigned|in_progress|resolved)$")
    note: Optional[str] = Field(default=None, max_length=500)


class AssignTeamRequest(BaseModel):
    team_id: int


# ── Team ──────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    type: str = Field(..., pattern=r"^(rescue|medical|volunteer)$")
    contact: Optional[str] = Field(default=None, max_length=200)
    is_available: bool = True


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    contact: Optional[str]
    is_available: bool
    created_at: datetime


# ── Resource ──────────────────────────────────────────────────

class ResourceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    type: str = Field(..., pattern=r"^(shelter|food|medical_supply|vehicle)$")
    quantity: int = Field(default=0, ge=0)
    is_available: bool = True


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    quantity: int
    is_available: bool
    created_at: datetime


# ── StatusHistory ─────────────────────────────────────────────

class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_id: int
    old_status: str
    new_status: str
    changed_by: int
    changed_at: datetime
    note: Optional[str]


# ── Assignment ────────────────────────────────────────────────

class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_id: int
    team_id: int
    assigned_by: int
    assigned_at: datetime


# ── Audit Log ─────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: Optional[int] = None
    actor_role: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime
    actor: Optional[UserOut] = None


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    limit: int

