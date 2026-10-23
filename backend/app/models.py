"""
SQLAlchemy ORM models — single source of truth for the DB schema.
"""

import enum
from datetime import datetime, timezone

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


# ── Enums ─────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    citizen = "citizen"
    volunteer = "volunteer"
    responder = "responder"
    admin = "admin"


class CategoryEnum(str, enum.Enum):
    rescue = "rescue"
    medical = "medical"
    food_water = "food_water"
    shelter = "shelter"
    other = "other"


class PriorityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class StatusEnum(str, enum.Enum):
    reported = "reported"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"


class TeamTypeEnum(str, enum.Enum):
    rescue = "rescue"
    medical = "medical"
    volunteer = "volunteer"


class ResourceTypeEnum(str, enum.Enum):
    shelter = "shelter"
    food = "food"
    medical_supply = "medical_supply"
    vehicle = "vehicle"


# ── Models ────────────────────────────────────────────────────

def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.citizen)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    incidents = relationship("Incident", back_populates="reporter")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(Enum(CategoryEnum), nullable=False)
    description = Column(Text, nullable=False)
    location_text = Column(String(300), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    people_affected = Column(Integer, default=1)
    priority = Column(Enum(PriorityEnum), default=PriorityEnum.medium)
    status = Column(Enum(StatusEnum), default=StatusEnum.reported)
    photo_key = Column(String(500), nullable=True)  # reserved for S3
    triage_score = Column(Integer, nullable=True)
    triage_reason = Column(Text, nullable=True)
    auto_triaged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    reporter = relationship("User", back_populates="incidents")
    assignments = relationship("Assignment", back_populates="incident")
    status_history = relationship("StatusHistory", back_populates="incident", order_by="StatusHistory.changed_at")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    type = Column(Enum(TeamTypeEnum), nullable=False)
    contact = Column(String(200), nullable=True)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    assignments = relationship("Assignment", back_populates="team")


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    type = Column(Enum(ResourceTypeEnum), nullable=False)
    quantity = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=_utcnow)

    incident = relationship("Incident", back_populates="assignments")
    team = relationship("Team", back_populates="assignments")


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    old_status = Column(Enum(StatusEnum), nullable=False)
    new_status = Column(Enum(StatusEnum), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    changed_at = Column(DateTime(timezone=True), default=_utcnow)
    note = Column(Text, nullable=True)

    incident = relationship("Incident", back_populates="status_history")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_role = Column(String(50), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=True, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, index=True)

    actor = relationship("User", foreign_keys=[actor_id])
