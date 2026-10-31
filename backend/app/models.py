"""
SQLAlchemy 2.0 ORM models — single source of truth for the ResQCloud DB schema.
Supports PostgreSQL (production / RDS) and SQLite (local dev).
"""

import enum
import uuid
import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _utcnow():
    return datetime.now(timezone.utc)


def generate_public_code() -> str:
    """Generate human-readable public code like DR-1023."""
    return f"DR-{secrets.randbelow(9000) + 1000}"


def generate_tracking_code() -> str:
    """Generate tracking code like TRK-A8B9C1."""
    return f"TRK-{secrets.token_hex(4).upper()}"


# ── Enums ─────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    citizen = "citizen"
    admin = "admin"


class CategoryEnum(str, enum.Enum):
    rescue = "rescue"
    medical = "medical"
    food_water = "food_water"
    shelter = "shelter"
    other = "other"


class PriorityEnum(str, enum.Enum):
    pending = "pending"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class StatusEnum(str, enum.Enum):
    reported = "reported"
    under_review = "under_review"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"
    cancelled = "cancelled"


class PlaceTypeEnum(str, enum.Enum):
    shelter = "shelter"
    hospital = "hospital"
    relief_supply = "relief_supply"


class TeamStatusEnum(str, enum.Enum):
    available = "available"
    busy = "busy"


class TeamTypeEnum(str, enum.Enum):
    rescue = "rescue"
    medical = "medical"
    volunteer = "volunteer"


class ResourceTypeEnum(str, enum.Enum):
    shelter = "shelter"
    food = "food"
    medical_supply = "medical_supply"
    vehicle = "vehicle"


class VehicleStatusEnum(str, enum.Enum):
    available = "available"
    in_use = "in_use"
    maintenance = "maintenance"


class SupplyCategoryEnum(str, enum.Enum):
    food = "food"
    water = "water"
    medical = "medical"
    other = "other"


# ── Core Models ───────────────────────────────────────────────

class User(Base):
    """
    Users table:
    id, full_name, email (unique), phone, password_hash,
    role (citizen|admin), created_at
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    name = Column(String(120), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum, native_enum=False), nullable=False, default=RoleEnum.citizen)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    incidents = relationship("Incident", back_populates="reporter")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        val = kwargs.get("full_name") or kwargs.get("name")
        kwargs["full_name"] = val
        kwargs["name"] = val
        super().__init__(**kwargs)


class Incident(Base):
    """
    Incidents table:
    id, public_code (e.g. DR-1023, unique), tracking_code, reporter_id (nullable),
    category (rescue|medical|food_water|shelter|other), description, address,
    latitude, longitude, people_affected, photo_key (nullable),
    priority (pending|low|medium|high|critical, default pending),
    status (reported|under_review|assigned|in_progress|resolved, default reported),
    created_at, updated_at
    """
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(50), unique=True, index=True, nullable=False, default=generate_public_code)
    tracking_code = Column(String(100), index=True, nullable=False, default=generate_tracking_code)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    category = Column(Enum(CategoryEnum, native_enum=False), nullable=False)
    description = Column(Text, nullable=False)
    address = Column(String(300), nullable=False)
    location_text = Column(String(300), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    people_affected = Column(Integer, default=1)
    photo_key = Column(String(500), nullable=True)
    priority = Column(Enum(PriorityEnum, native_enum=False), default=PriorityEnum.pending)
    status = Column(Enum(StatusEnum, native_enum=False), default=StatusEnum.reported)
    triage_score = Column(Integer, nullable=True)
    triage_reason = Column(Text, nullable=True)
    auto_triaged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    reporter = relationship("User", back_populates="incidents")
    assignments = relationship("Assignment", back_populates="incident", cascade="all, delete-orphan")
    status_history = relationship(
        "StatusHistory",
        back_populates="incident",
        order_by="StatusHistory.created_at",
        cascade="all, delete-orphan",
    )
    notifications = relationship("Notification", back_populates="incident", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        loc = kwargs.get("address") or kwargs.get("location_text")
        kwargs["address"] = loc
        kwargs["location_text"] = loc
        if "public_code" not in kwargs:
            kwargs["public_code"] = generate_public_code()
        if "tracking_code" not in kwargs:
            kwargs["tracking_code"] = generate_tracking_code()
        super().__init__(**kwargs)


class StatusHistory(Base):
    """
    Status history table:
    id, incident_id, old_status, new_status, changed_by, note, created_at
    """
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    old_status = Column(String(50), nullable=False)
    new_status = Column(String(50), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    changed_at = Column(DateTime(timezone=True), nullable=True)

    incident = relationship("Incident", back_populates="status_history")
    changer = relationship("User", foreign_keys=[changed_by])

    def __init__(self, **kwargs):
        t = kwargs.get("created_at") or kwargs.get("changed_at") or _utcnow()
        kwargs["created_at"] = t
        kwargs["changed_at"] = t
        super().__init__(**kwargs)


class Notification(Base):
    """
    Notifications table:
    id, user_id, incident_id (nullable), type, title, message, is_read, created_at
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    user = relationship("User", back_populates="notifications")
    incident = relationship("Incident", back_populates="notifications")


class Place(Base):
    """
    Places table:
    id, type (shelter|hospital|relief_supply), name, latitude, longitude,
    address, capacity, current_occupancy, available (bool), contact
    """
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(Enum(PlaceTypeEnum, native_enum=False), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(300), nullable=False)
    capacity = Column(Integer, default=0, nullable=False)
    current_occupancy = Column(Integer, default=0, nullable=False)
    available = Column(Boolean, default=True, nullable=False)
    contact = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class ResponseTeam(Base):
    """
    Response teams table:
    id, name, latitude, longitude, status (available|busy),
    contact, members_count, current_incident_id
    """
    __tablename__ = "response_teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(Enum(TeamStatusEnum, native_enum=False), default=TeamStatusEnum.available, nullable=False)
    contact = Column(String(100), nullable=True)
    members_count = Column(Integer, default=5, nullable=False)
    current_incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    current_incident = relationship("Incident", foreign_keys=[current_incident_id])
    vehicles = relationship("Vehicle", back_populates="assigned_team")


class Vehicle(Base):
    """
    Vehicles table:
    id, name, type, plate, status (available|in_use|maintenance),
    assigned_team_id, current_incident_id, created_at
    """
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    type = Column(String(50), nullable=False)  # ambulance | fire_truck | boat | supply_truck | suv_4x4
    plate = Column(String(50), unique=True, index=True, nullable=False)
    status = Column(Enum(VehicleStatusEnum, native_enum=False), default=VehicleStatusEnum.available, nullable=False)
    assigned_team_id = Column(Integer, ForeignKey("response_teams.id", ondelete="SET NULL"), nullable=True)
    current_incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    assigned_team = relationship("ResponseTeam", back_populates="vehicles")
    current_incident = relationship("Incident", foreign_keys=[current_incident_id])


class Supply(Base):
    """
    Supplies table:
    id, item, category (food|water|medical|other), quantity, unit,
    low_stock_threshold, location, created_at
    """
    __tablename__ = "supplies"

    id = Column(Integer, primary_key=True, index=True)
    item = Column(String(150), nullable=False)
    category = Column(Enum(SupplyCategoryEnum, native_enum=False), default=SupplyCategoryEnum.other, nullable=False)
    quantity = Column(Integer, default=0, nullable=False)
    unit = Column(String(50), default="units", nullable=False)
    low_stock_threshold = Column(Integer, default=10, nullable=False)
    location = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class IncidentSupplyAllocation(Base):
    """
    Tracks supplies allocated to incidents.
    """
    __tablename__ = "incident_supply_allocations"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    supply_id = Column(Integer, ForeignKey("supplies.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    incident = relationship("Incident")
    supply = relationship("Supply")


# ── Auxiliary / Compatibility Models ──────────────────────────

class Team(Base):
    """Compatibility team model for dispatch assignments."""
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    type = Column(Enum(TeamTypeEnum, native_enum=False), nullable=False, default=TeamTypeEnum.rescue)
    contact = Column(String(200), nullable=True)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    assignments = relationship("Assignment", back_populates="team", cascade="all, delete-orphan")


class Resource(Base):
    """Resources table for equipment / logistics."""
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    type = Column(Enum(ResourceTypeEnum, native_enum=False), nullable=False)
    quantity = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class Assignment(Base):
    """Assignments linking incidents and dispatch teams."""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=_utcnow)

    incident = relationship("Incident", back_populates="assignments")
    team = relationship("Team", back_populates="assignments")


class AuditLog(Base):
    """Audit log for compliance and security."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_role = Column(String(50), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=True, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, index=True)

    actor = relationship("User", foreign_keys=[actor_id])
