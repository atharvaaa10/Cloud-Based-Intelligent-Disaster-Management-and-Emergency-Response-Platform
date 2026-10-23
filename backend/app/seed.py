"""
Seed script — populates the database with demo data.

Run:  python -m app.seed
"""

import asyncio
import sys
import os

# Ensure backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, async_session
from app.models import (
    Base,
    User,
    Team,
    Resource,
    Incident,
    RoleEnum,
    TeamTypeEnum,
    ResourceTypeEnum,
    CategoryEnum,
    PriorityEnum,
    StatusEnum,
)
from app.auth import hash_password


async def seed():
    try:
        # Create all tables (safe for dev; production uses Alembic)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with async_session() as session:
            from sqlalchemy import select
            existing = await session.execute(select(User).where(User.email == "admin@disaster.io"))
            if existing.scalar_one_or_none():
                print("[INFO] Database already seeded. Skipping duplicate seeding.")
                return

            # ── Users ─────────────────────────────────────────────
            admin = User(
                name="Admin User",
                email="admin@disaster.io",
                password_hash=hash_password("admin123"),
                role=RoleEnum.admin,
            )
            responder = User(
                name="Responder One",
                email="responder@disaster.io",
                password_hash=hash_password("resp123"),
                role=RoleEnum.responder,
            )
            citizen = User(
                name="Citizen Demo",
                email="citizen@disaster.io",
                password_hash=hash_password("cit123"),
                role=RoleEnum.citizen,
            )
            session.add_all([admin, responder, citizen])
            await session.flush()

            # ── Teams ─────────────────────────────────────────────
            teams = [
                Team(name="Alpha Rescue Squad", type=TeamTypeEnum.rescue, contact="+91-9876543210"),
                Team(name="Beta Medical Unit", type=TeamTypeEnum.medical, contact="+91-9876543211"),
                Team(name="Gamma Volunteer Corps", type=TeamTypeEnum.volunteer, contact="+91-9876543212"),
                Team(name="Delta Rescue Force", type=TeamTypeEnum.rescue, contact="+91-9876543213"),
            ]
            session.add_all(teams)

            # ── Resources ─────────────────────────────────────────
            resources = [
                Resource(name="Pune Relief Shelter A", type=ResourceTypeEnum.shelter, quantity=200),
                Resource(name="Emergency Food Kit Batch", type=ResourceTypeEnum.food, quantity=500),
                Resource(name="First Aid Supply Crate", type=ResourceTypeEnum.medical_supply, quantity=100),
                Resource(name="Rescue Boat Fleet", type=ResourceTypeEnum.vehicle, quantity=8),
                Resource(name="Mumbai Shelter B", type=ResourceTypeEnum.shelter, quantity=150),
                Resource(name="Water Purification Units", type=ResourceTypeEnum.medical_supply, quantity=30),
            ]
            session.add_all(resources)

            # ── Sample Incidents ──────────────────────────────────
            incidents = [
                Incident(
                    reporter_id=citizen.id,
                    category=CategoryEnum.rescue,
                    description="Severe flooding in Kothrud area, Pune. Multiple families stranded on rooftops. Water level rising rapidly. Urgent rescue boats needed.",
                    location_text="Kothrud, Pune, Maharashtra",
                    latitude=18.5074,
                    longitude=73.8077,
                    people_affected=45,
                    priority=PriorityEnum.critical,
                    status=StatusEnum.reported,
                ),
                Incident(
                    reporter_id=citizen.id,
                    category=CategoryEnum.medical,
                    description="Medical emergency at a flood relief camp. Several elderly people showing symptoms of waterborne diseases. Need medical supplies and doctors.",
                    location_text="Hadapsar, Pune, Maharashtra",
                    latitude=18.5089,
                    longitude=73.9260,
                    people_affected=12,
                    priority=PriorityEnum.high,
                    status=StatusEnum.reported,
                ),
                Incident(
                    reporter_id=citizen.id,
                    category=CategoryEnum.food_water,
                    description="Food and clean water shortage at temporary shelter. Over 100 displaced families with children need immediate provisions.",
                    location_text="Sinhagad Road, Pune, Maharashtra",
                    latitude=18.4863,
                    longitude=73.8198,
                    people_affected=120,
                    priority=PriorityEnum.high,
                    status=StatusEnum.reported,
                ),
                Incident(
                    reporter_id=citizen.id,
                    category=CategoryEnum.shelter,
                    description="Houses collapsed after heavy rainfall. 30 families need temporary shelter immediately. Area roads waterlogged.",
                    location_text="Katraj, Pune, Maharashtra",
                    latitude=18.4575,
                    longitude=73.8554,
                    people_affected=30,
                    priority=PriorityEnum.medium,
                    status=StatusEnum.reported,
                ),
            ]
            session.add_all(incidents)
            await session.commit()

        print("[SUCCESS] Seed data inserted successfully!")
        print()
        print("Demo credentials:")
        print("  Admin     -> admin@disaster.io     / admin123")
        print("  Responder -> responder@disaster.io  / resp123")
        print("  Citizen   -> citizen@disaster.io    / cit123")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
