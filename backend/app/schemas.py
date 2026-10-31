"""
Pydantic schemas for request / response validation.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
import re
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator, field_validator


# ── Auth ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("citizen", "admin"):
            raise ValueError(f"Invalid role '{v}'. Allowed roles are 'citizen' or 'admin'.")
        return v

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
    status: str = Field(..., pattern=r"^(reported|under_review|assigned|in_progress|resolved|cancelled)$")
    note: Optional[str] = Field(default=None, max_length=500)


class IncidentCancelRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class IncidentNoteRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)


class PaginatedIncidentsOut(BaseModel):
    items: List[IncidentOut]
    total: int
    page: int
    limit: int
    pages: int


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
    current_occupancy: int = Field(default=0, ge=0)
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
    current_occupancy: int = 0
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
    team_name: Optional[str] = None


class IncidentDetail(IncidentOut):
    reporter: Optional[UserOut] = None
    assignments: List[AssignmentOut] = []
    status_history: List[StatusHistoryOut] = []
    assigned_team_name: Optional[str] = None
    photo_url: Optional[str] = None


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


# ── Citizen Overview ──────────────────────────────────────────

class CitizenStats(BaseModel):
    total: int
    active: int
    resolved: int
    under_review: int = 0
    in_progress: int = 0


class NearbyShelterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    capacity: int
    current_occupancy: int = 0
    available: bool
    contact: Optional[str] = None
    distance_km: float


class AnnouncementOut(BaseModel):
    id: str
    title: str
    message: str
    severity: str  # critical | warning | info
    source: str
    issued_at: datetime
    active: bool = True


class CitizenOverviewOut(BaseModel):
    stats: CitizenStats
    recent_requests: List[IncidentOut]
    announcements: List[AnnouncementOut]
    nearby_shelters: List[NearbyShelterOut]
    user_location: Dict[str, Any]


# ── Live Map Schemas ──────────────────────────────────────────

class PublicIncidentMarker(BaseModel):
    id: int
    public_code: str
    category: str
    approx_latitude: float
    approx_longitude: float
    general_area: str
    priority: str
    status: str
    people_affected: Optional[int] = None
    created_at: datetime


class AffectedZoneOut(BaseModel):
    id: str
    name: str
    category: str
    severity: str  # critical | high | medium | low
    center_latitude: float
    center_longitude: float
    radius_meters: int
    description: str


class PublicTeamMarker(BaseModel):
    id: int
    name: str
    approx_latitude: Optional[float] = None
    approx_longitude: Optional[float] = None
    status: str


class PublicMapResponse(BaseModel):
    incidents: List[PublicIncidentMarker]
    places: List[PlaceOut]
    affected_zones: List[AffectedZoneOut]
    teams: List[PublicTeamMarker] = []
    total_public_incidents: int
    total_places: int
    total_teams: int = 0


# ── Global Operations Stat Cards (Citizen Header KPIs) ────────

class GlobalStatCardsOut(BaseModel):
    active_incidents: int
    incident_trend_pct: float
    people_affected: int
    total_response_teams: int
    teams_on_ground: int
    total_shelters: int
    nearby_shelters_count: Optional[int] = None
    total_supply_points: int
    stock_level_status: str  # "Low" | "Adequate" | "Good"


# ── Admin Overview Schema ──────────────────────────────────────

class DailyIncidentCount(BaseModel):
    date: str
    count: int


class AdminOverviewOut(BaseModel):
    total_incidents: int
    pending_reports: int
    active_emergencies: int
    resolved_cases: int
    critical_alerts: int
    incidents_per_day: List[DailyIncidentCount]
    by_category: Dict[str, int]
    critical_incidents: List[IncidentOut] = []

# ── Admin Incident Management Schemas ─────────────────────────

class ReporterContactOut(BaseModel):
    id: int
    name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class AdminIncidentDetailOut(BaseModel):
    id: int
    public_code: str
    tracking_code: str
    reporter_id: Optional[int] = None
    category: str
    description: str
    address: Optional[str] = None
    location_text: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    people_affected: Optional[int] = None
    priority: str
    status: str
    photo_key: Optional[str] = None
    photo_url: Optional[str] = None
    triage_score: Optional[int] = None
    triage_reason: Optional[str] = None
    auto_triaged_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    reporter: Optional[ReporterContactOut] = None
    status_history: List[StatusHistoryOut] = []
    assignments: List[AssignmentOut] = []
    suggested_priority: Optional[Dict[str, Any]] = None


class AdminIncidentListResponse(BaseModel):
    items: List[IncidentOut]
    total: int
    page: int
    limit: int
    total_pages: int


class AdminIncidentPatchRequest(BaseModel):
    priority: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None



class AdminIncidentMarker(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    public_code: str
    tracking_code: str
    category: str
    description: str
    address: Optional[str] = None
    location_text: Optional[str] = None
    latitude: float
    longitude: float
    people_affected: Optional[int] = None
    priority: str
    status: str
    photo_key: Optional[str] = None
    photo_url: Optional[str] = None
    triage_score: Optional[int] = None
    triage_reason: Optional[str] = None
    created_at: datetime
    reporter: Optional[ReporterContactOut] = None
    assigned_teams: List[str] = []


class AdminTeamMarker(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str


class AdminMapResponse(BaseModel):
    incidents: List[AdminIncidentMarker]
    shelters: List[PlaceOut]
    hospitals: List[PlaceOut]
    supplies: List[PlaceOut]
    places: List[PlaceOut]
    response_teams: List[AdminTeamMarker]
    affected_zones: List[AffectedZoneOut]
    total_incidents: int
    total_shelters: int
    total_hospitals: int
    total_supplies: int
    total_teams: int
    total_zones: int


# ── Admin Resources & Teams ───────────────────────────────────

class ResourcesSummaryOut(BaseModel):
    available_teams: int
    vehicles_in_use: int
    low_stock_items: int
    free_shelter_beds: int
    total_teams: int
    total_vehicles: int
    total_supplies: int
    total_shelters: int


class AdminResponseTeamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    contact: Optional[str] = Field(default=None, max_length=100)
    members_count: int = Field(default=5, ge=1, le=100)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = Field(default="available", pattern=r"^(available|busy)$")


class AdminResponseTeamUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    contact: Optional[str] = Field(default=None, max_length=100)
    members_count: int = Field(default=5, ge=1, le=100)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = Field(default="available", pattern=r"^(available|busy)$")


class AdminResponseTeamPatch(BaseModel):
    status: Optional[str] = Field(default=None, pattern=r"^(available|busy)$")
    contact: Optional[str] = None
    members_count: Optional[int] = Field(default=None, ge=1)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AdminResponseTeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    contact: Optional[str] = None
    members_count: int = 5
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str
    current_incident_id: Optional[int] = None
    current_incident_code: Optional[str] = None
    created_at: Optional[datetime] = None
    assigned_vehicle_count: int = 0


# ── Vehicles ──────────────────────────────────────────────────

class VehicleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    type: str = Field(..., min_length=2, max_length=50)
    plate: str = Field(..., min_length=3, max_length=50)
    status: str = Field(default="available", pattern=r"^(available|in_use|maintenance)$")
    assigned_team_id: Optional[int] = None


class VehicleUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    type: str = Field(..., min_length=2, max_length=50)
    plate: str = Field(..., min_length=3, max_length=50)
    status: str = Field(default="available", pattern=r"^(available|in_use|maintenance)$")
    assigned_team_id: Optional[int] = None


class VehiclePatch(BaseModel):
    status: Optional[str] = Field(default=None, pattern=r"^(available|in_use|maintenance)$")
    assigned_team_id: Optional[int] = None
    current_incident_id: Optional[int] = None


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    plate: str
    status: str
    assigned_team_id: Optional[int] = None
    assigned_team_name: Optional[str] = None
    current_incident_id: Optional[int] = None
    current_incident_code: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Supplies ──────────────────────────────────────────────────

class SupplyCreate(BaseModel):
    item: str = Field(..., min_length=2, max_length=150)
    category: str = Field(..., pattern=r"^(food|water|medical|other)$")
    quantity: int = Field(default=0, ge=0)
    unit: str = Field(default="units", min_length=1, max_length=50)
    low_stock_threshold: int = Field(default=10, ge=0)
    location: str = Field(..., min_length=2, max_length=200)


class SupplyUpdate(BaseModel):
    item: str = Field(..., min_length=2, max_length=150)
    category: str = Field(..., pattern=r"^(food|water|medical|other)$")
    quantity: int = Field(..., ge=0)
    unit: str = Field(default="units", min_length=1, max_length=50)
    low_stock_threshold: int = Field(default=10, ge=0)
    location: str = Field(..., min_length=2, max_length=200)


class SupplyPatch(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=0)
    delta: Optional[int] = None
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)


class SupplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item: str
    category: str
    quantity: int
    unit: str
    low_stock_threshold: int
    location: str
    is_low_stock: bool = False
    created_at: Optional[datetime] = None


# ── Shelters ──────────────────────────────────────────────────

class ShelterCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    address: str = Field(..., min_length=3, max_length=300)
    latitude: float
    longitude: float
    capacity: int = Field(default=100, ge=1)
    current_occupancy: int = Field(default=0, ge=0)
    available: bool = True
    contact: Optional[str] = Field(default=None, max_length=100)


class ShelterUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    address: str = Field(..., min_length=3, max_length=300)
    latitude: float
    longitude: float
    capacity: int = Field(..., ge=1)
    current_occupancy: int = Field(..., ge=0)
    available: bool = True
    contact: Optional[str] = Field(default=None, max_length=100)


class ShelterPatch(BaseModel):
    current_occupancy: Optional[int] = Field(default=None, ge=0)
    delta_occupancy: Optional[int] = None
    capacity: Optional[int] = Field(default=None, ge=1)
    available: Optional[bool] = None
    contact: Optional[str] = None


class ShelterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    capacity: int
    current_occupancy: int
    available: bool
    contact: Optional[str] = None
    free_beds: int = 0
    occupancy_pct: float = 0.0
    created_at: Optional[datetime] = None


# ── Incident Resource Allocation & Release ────────────────────

class SupplyAllocationItem(BaseModel):
    supply_id: int
    quantity: int = Field(..., ge=1)


class IncidentAssignResourcesRequest(BaseModel):
    team_id: Optional[int] = None
    vehicle_ids: Optional[List[int]] = []
    supplies: Optional[List[SupplyAllocationItem]] = []


class IncidentAssignResourcesResponse(BaseModel):
    incident_id: int
    incident_status: str
    assigned_team_id: Optional[int] = None
    assigned_vehicle_ids: List[int] = []
    allocated_supplies: List[Dict[str, Any]] = []
    message: str


class IncidentReleaseResourcesResponse(BaseModel):
    incident_id: int
    freed_teams: int
    freed_vehicles: int
    message: str
