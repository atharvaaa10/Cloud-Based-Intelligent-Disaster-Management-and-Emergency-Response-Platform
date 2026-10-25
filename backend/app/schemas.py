"""
Pydantic schemas for request / response validation.
"""

from datetime import datetime
from typing import Optional, List
import re
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator, field_validator


# ── Auth ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z0-9]", v):
            raise ValueError("Password must contain at least one uppercase letter or digit")
        return v

    @model_validator(mode="after")
    def populate_names(self):
        if not self.full_name and self.name:
            self.full_name = self.name
        elif not self.name and self.full_name:
            self.name = self.full_name
        if not self.full_name:
            raise ValueError("full_name or name must be provided")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    role: str
    created_at: datetime

    @model_validator(mode="after")
    def sync_name(self):
        if not self.name and self.full_name:
            self.name = self.full_name
        return self


# ── Incident ─────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    category: str = Field(..., pattern=r"^(rescue|medical|food_water|shelter|other)$")
    description: str = Field(..., min_length=10, max_length=2000)
    address: Optional[str] = Field(default=None, max_length=300)
    location_text: Optional[str] = Field(default=None, max_length=300)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    people_affected: int = Field(default=1, ge=1, le=1000)
    photo_key: Optional[str] = None

    # Maharashtra bounding box (approximate)
    _MH_LAT_MIN: float = 15.6
    _MH_LAT_MAX: float = 22.1
    _MH_LON_MIN: float = 72.6
    _MH_LON_MAX: float = 80.9

    @model_validator(mode="after")
    def sync_address(self):
        if not self.address and self.location_text:
            self.address = self.location_text
        elif not self.location_text and self.address:
            self.location_text = self.address
        if not self.address or len(self.address.strip()) < 3:
            raise ValueError("address or location_text must be at least 3 characters")
        return self

    @model_validator(mode="after")
    def validate_coordinates(self):
        lat, lon = self.latitude, self.longitude
        if lat is None and lon is None:
            return self  # coordinates are optional
        if lat is None or lon is None:
            raise ValueError("Both latitude and longitude must be provided together.")
        if not (self._MH_LAT_MIN <= lat <= self._MH_LAT_MAX):
            raise ValueError(
                f"Latitude {lat:.4f} is outside Maharashtra "
                f"({self._MH_LAT_MIN}\u2013{self._MH_LAT_MAX}). Please verify your location."
            )
        if not (self._MH_LON_MIN <= lon <= self._MH_LON_MAX):
            raise ValueError(
                f"Longitude {lon:.4f} is outside Maharashtra "
                f"({self._MH_LON_MIN}\u2013{self._MH_LON_MAX}). Please verify your location."
            )
        return self


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
    public_code: str
    tracking_code: str
    reporter_id: Optional[int] = None
    category: str
    description: str
    address: str
    location_text: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    people_affected: int
    priority: str
    status: str
    photo_key: Optional[str] = None
    triage_score: Optional[int] = None
    triage_reason: Optional[str] = None
    auto_triaged_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def sync_location(self):
        if not self.location_text and self.address:
            self.location_text = self.address
        return self


class IncidentTriageRequest(BaseModel):
    priority: str = Field(..., pattern=r"^(pending|low|medium|high|critical)$")
    triage_reason: str = Field(..., min_length=3, max_length=1000)
    score: int = Field(..., ge=0, le=200)


class PriorityUpdate(BaseModel):
    priority: str = Field(..., pattern=r"^(pending|low|medium|high|critical)$")


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(reported|under_review|assigned|in_progress|resolved)$")
    note: Optional[str] = Field(default=None, max_length=500)


class AssignTeamRequest(BaseModel):
    team_id: int


# ── StatusHistory ─────────────────────────────────────────────

class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_id: int
    old_status: str
    new_status: str
    changed_by: Optional[int] = None
    created_at: datetime
    changed_at: Optional[datetime] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def sync_time(self):
        if not self.changed_at and self.created_at:
            self.changed_at = self.created_at
        return self


# ── Notification ──────────────────────────────────────────────

class NotificationCreate(BaseModel):
    user_id: int
    incident_id: Optional[int] = None
    type: str = Field(..., max_length=50)
    title: str = Field(..., max_length=200)
    message: str


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    incident_id: Optional[int] = None
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime


# ── Place ─────────────────────────────────────────────────────

class PlaceCreate(BaseModel):
    type: str = Field(..., pattern=r"^(shelter|hospital|relief_supply)$")
    name: str = Field(..., min_length=2, max_length=200)
    latitude: float
    longitude: float
    address: str = Field(..., min_length=3, max_length=300)
    capacity: int = Field(default=0, ge=0)
    available: bool = True
    contact: Optional[str] = Field(default=None, max_length=100)


class PlaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    name: str
    latitude: float
    longitude: float
    address: str
    capacity: int
    available: bool
    contact: Optional[str] = None
    created_at: Optional[datetime] = None


# ── ResponseTeam ──────────────────────────────────────────────

class ResponseTeamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = Field(default="available", pattern=r"^(available|busy)$")


class ResponseTeamStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(available|busy)$")


class ResponseTeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str
    created_at: Optional[datetime] = None


# ── Assignment ────────────────────────────────────────────────

class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_id: int
    team_id: int
    assigned_by: int
    assigned_at: datetime


class IncidentDetail(IncidentOut):
    reporter: Optional[UserOut] = None
    assignments: List[AssignmentOut] = []
    status_history: List[StatusHistoryOut] = []


# ── Compatibility: Team & Resource ───────────────────────────

class TeamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    type: str = Field(default="rescue", pattern=r"^(rescue|medical|volunteer)$")
    contact: Optional[str] = Field(default=None, max_length=200)
    is_available: bool = True


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    contact: Optional[str] = None
    is_available: bool
    created_at: datetime


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
    items: List[AuditLogOut]
    total: int
    page: int
    limit: int
