"""
Database seed script with realistic Pune, India disaster response data.
Localities: Kothrud, Hinjawadi, Baner, Wakad, Aundh, Sinhagad Road.

Data summary:
- Demo users for all roles: admin, responder, volunteer, citizen
- 8 Response teams (response_teams & teams)
- 6 Emergency shelters (places)
- 4 Hospitals (places)
- 2 Relief supply depots (places)
- 25 Realistic Pune emergency incidents with status histories & notifications
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.database import async_session, engine
from app.models import (
    Base,
    CategoryEnum,
    Incident,
    Notification,
    Place,
    PlaceTypeEnum,
    PriorityEnum,
    Resource,
    ResourceTypeEnum,
    ResponseTeam,
    RoleEnum,
    StatusEnum,
    StatusHistory,
    Team,
    TeamStatusEnum,
    TeamTypeEnum,
    User,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc)


async def seed_data():
    from app.config import get_settings
    settings = get_settings()
    if settings.ENV == "production":
        raise RuntimeError("Refusing to seed default demo passwords in ENV=production")

    async with async_session() as db:
        logger.info("[SEED] Cleaning up existing records...")
        await db.execute(delete(Notification))
        await db.execute(delete(StatusHistory))
        await db.execute(delete(Incident))
        await db.execute(delete(Place))
        await db.execute(delete(ResponseTeam))
        await db.execute(delete(Resource))
        await db.execute(delete(Team))
        await db.execute(delete(User))
        await db.commit()

        # ── 1. Demo Users for Every Role ──────────────────────────────
        logger.info("[SEED] Seeding demo users...")
        users_data = [
            {
                "full_name": "Rajesh Kulkarni (Disaster Ops Director)",
                "email": "admin@disaster.io",
                "phone": "+91 98230 11223",
                "password": "admin123",
                "role": RoleEnum.admin,
            },
            {
                "full_name": "Suresh Patil (Fire & Rescue Commander)",
                "email": "responder@disaster.io",
                "phone": "+91 98220 33445",
                "password": "resp123",
                "role": RoleEnum.responder,
            },
            {
                "full_name": "Pooja Deshmukh (Pune Volunteer Lead)",
                "email": "volunteer@disaster.io",
                "phone": "+91 98225 55667",
                "password": "vol123",
                "role": RoleEnum.volunteer,
            },
            {
                "full_name": "Amit Joshi (Kothrud Resident)",
                "email": "citizen@disaster.io",
                "phone": "+91 98221 77889",
                "password": "cit123",
                "role": RoleEnum.citizen,
            },
            {
                "full_name": "Priya Sharma (Hinjawadi Techie)",
                "email": "priya.sharma@example.com",
                "phone": "+91 98222 11001",
                "password": "pass123",
                "role": RoleEnum.citizen,
            },
            {
                "full_name": "Rahul More (Sinhagad Road Resident)",
                "email": "rahul.more@example.com",
                "phone": "+91 98223 22002",
                "password": "pass123",
                "role": RoleEnum.citizen,
            },
            {
                "full_name": "Ananya Desai (Baner Resident)",
                "email": "ananya.desai@example.com",
                "phone": "+91 98224 33003",
                "password": "pass123",
                "role": RoleEnum.citizen,
            },
        ]

        created_users = {}
        for u in users_data:
            user = User(
                full_name=u["full_name"],
                email=u["email"],
                phone=u["phone"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
            )
            db.add(user)
            await db.flush()
            created_users[u["email"]] = user

        admin_user = created_users["admin@disaster.io"]
        resp_user = created_users["responder@disaster.io"]
        cit_user = created_users["citizen@disaster.io"]
        priya_user = created_users["priya.sharma@example.com"]
        rahul_user = created_users["rahul.more@example.com"]
        ananya_user = created_users["ananya.desai@example.com"]

        # ── 2. Response Teams (8 Teams) ──────────────────────────────
        logger.info("[SEED] Seeding 8 Pune response teams...")
        teams_data = [
            {"name": "Pune Fire Brigade - Kothrud Station Unit 1", "lat": 18.5085, "lon": 73.8062, "status": TeamStatusEnum.available, "type": TeamTypeEnum.rescue, "contact": "+91 20 2544 0101"},
            {"name": "NDRF Battalion 5 Quick Response Team - Hinjawadi", "lat": 18.5895, "lon": 73.7370, "status": TeamStatusEnum.busy, "type": TeamTypeEnum.rescue, "contact": "+91 20 2740 1200"},
            {"name": "PMDA Disaster Response Cell - Baner Team", "lat": 18.5612, "lon": 73.7845, "status": TeamStatusEnum.available, "type": TeamTypeEnum.rescue, "contact": "+91 20 2550 1100"},
            {"name": "PCMC Rapid Rescue Unit - Wakad Base", "lat": 18.5992, "lon": 73.7681, "status": TeamStatusEnum.available, "type": TeamTypeEnum.rescue, "contact": "+91 20 2742 5555"},
            {"name": "Sassoon Trauma & Critical Medical Mobile - Aundh", "lat": 18.5620, "lon": 73.8042, "status": TeamStatusEnum.busy, "type": TeamTypeEnum.medical, "contact": "+91 20 2612 8000"},
            {"name": "Sinhagad Road Flash Flood Rescue Squad", "lat": 18.4725, "lon": 73.8260, "status": TeamStatusEnum.available, "type": TeamTypeEnum.rescue, "contact": "+91 20 2435 0101"},
            {"name": "Pune Civil Defense Emergency Volunteers - Central", "lat": 18.5050, "lon": 73.8110, "status": TeamStatusEnum.available, "type": TeamTypeEnum.volunteer, "contact": "+91 20 2553 4400"},
            {"name": "Maharashtra 108 Emergency Ambulance Fleet - West Pune", "lat": 18.5575, "lon": 73.7910, "status": TeamStatusEnum.busy, "type": TeamTypeEnum.medical, "contact": "108 / +91 20 6711 0108"},
        ]

        for t in teams_data:
            # Seed in response_teams table
            r_team = ResponseTeam(
                name=t["name"],
                latitude=t["lat"],
                longitude=t["lon"],
                status=t["status"],
            )
            db.add(r_team)

            # Seed in legacy teams table for compatibility
            team = Team(
                name=t["name"],
                type=t["type"],
                contact=t["contact"],
                is_available=(t["status"] == TeamStatusEnum.available),
            )
            db.add(team)

        # ── 3. Places: 6 Shelters, 4 Hospitals, 2 Relief Supplies ────
        logger.info("[SEED] Seeding Pune shelters, hospitals, and supply depots...")
        places_data = [
            # 6 Shelters
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Kothrud Municipal Community Hall Relief Shelter",
                "lat": 18.5065,
                "lon": 73.8082,
                "address": "Paud Road, near Vanaz Corner, Kothrud, Pune 411038",
                "capacity": 250,
                "available": True,
                "contact": "+91 20 2543 8901",
            },
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Hinjawadi IT Park Sports Complex Emergency Shelter",
                "lat": 18.5930,
                "lon": 73.7360,
                "address": "Phase 1, Hinjawadi Rajiv Gandhi Infotech Park, Pune 411057",
                "capacity": 400,
                "available": True,
                "contact": "+91 20 6674 1200",
            },
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Balewadi National Sports Complex Disaster Refuge Center",
                "lat": 18.5742,
                "lon": 73.7725,
                "address": "Balewadi Stadium Road, near Baner, Pune 411045",
                "capacity": 750,
                "available": True,
                "contact": "+91 20 2737 4000",
            },
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Wakad Municipal Primary School Relief Camp",
                "lat": 18.5975,
                "lon": 73.7650,
                "address": "Datta Mandir Road, Wakad, Pimpri-Chinchwad, Pune 411057",
                "capacity": 180,
                "available": True,
                "contact": "+91 20 2728 5511",
            },
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Aundh Vidyalaya Emergency Disaster Shelter",
                "lat": 18.5595,
                "lon": 73.8020,
                "address": "Parihar Chowk, DP Road, Aundh, Pune 411007",
                "capacity": 220,
                "available": True,
                "contact": "+91 20 2588 3490",
            },
            {
                "type": PlaceTypeEnum.shelter,
                "name": "Sinhagad Road Community Center & Flood Relief Hub",
                "lat": 18.4705,
                "lon": 73.8285,
                "address": "Manik Baug, Sinhagad Road, Pune 411051",
                "capacity": 350,
                "available": True,
                "contact": "+91 20 2435 6789",
            },
            # 4 Hospitals
            {
                "type": PlaceTypeEnum.hospital,
                "name": "Sahyadri Super Speciality Hospital Kothrud",
                "lat": 18.5042,
                "lon": 73.8145,
                "address": "Plot No. 30-C, Erandwane, Karve Road, Kothrud, Pune 411004",
                "capacity": 150,
                "available": True,
                "contact": "+91 20 6721 3000",
            },
            {
                "type": PlaceTypeEnum.hospital,
                "name": "Ruby Hall Clinic Hinjawadi",
                "lat": 18.5948,
                "lon": 73.7342,
                "address": "Rajiv Gandhi Infotech Park, Phase 1, Hinjawadi, Pune 411057",
                "capacity": 120,
                "available": True,
                "contact": "+91 20 6645 5100",
            },
            {
                "type": PlaceTypeEnum.hospital,
                "name": "Jupiter Hospital Baner",
                "lat": 18.5582,
                "lon": 73.7801,
                "address": "Baner - Balewadi Road, near Prathamesh Park, Baner, Pune 411045",
                "capacity": 260,
                "available": True,
                "contact": "+91 20 2799 2799",
            },
            {
                "type": PlaceTypeEnum.hospital,
                "name": "Aundh District Civil Hospital",
                "lat": 18.5635,
                "lon": 73.8068,
                "address": "Bremen Chowk, Chest Hospital Campus, Aundh, Pune 411027",
                "capacity": 320,
                "available": True,
                "contact": "+91 20 2588 0341",
            },
            # 2 Relief Supplies
            {
                "type": PlaceTypeEnum.relief_supply,
                "name": "PMC Central Disaster Food & Water Distribution Depot - Kothrud",
                "lat": 18.5020,
                "lon": 73.8090,
                "address": "Paud Phata Ward Office, Kothrud, Pune 411038",
                "capacity": 5000,
                "available": True,
                "contact": "+91 20 2544 1122",
            },
            {
                "type": PlaceTypeEnum.relief_supply,
                "name": "PCMC West Zone Emergency Relief Supply Warehouse - Wakad",
                "lat": 18.6010,
                "lon": 73.7620,
                "address": "Bhumkar Chowk Warehousing Complex, Wakad, Pune 411057",
                "capacity": 8000,
                "available": True,
                "contact": "+91 20 2742 9900",
            },
        ]

        for p in places_data:
            place = Place(
                type=p["type"],
                name=p["name"],
                latitude=p["lat"],
                longitude=p["lon"],
                address=p["address"],
                capacity=p["capacity"],
                available=p["available"],
                contact=p["contact"],
            )
            db.add(place)

        # ── 4. 25 Incidents across Pune Localities ───────────────────
        logger.info("[SEED] Seeding 25 realistic emergency incidents across Pune...")
        incidents_data = [
            # ── KOTHRUD (1-4)
            {
                "public_code": "DR-1001",
                "tracking_code": "TRK-KOTH01",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.rescue,
                "description": "Severe waterlogging in the basement parking of apartment complex near Dahanukar Colony, Paud Road. Water levels rising rapidly, 12 residents trapped in lift lobby.",
                "address": "Dahanukar Colony, Paud Road, Kothrud, Pune",
                "latitude": 18.5052,
                "longitude": 73.8045,
                "people_affected": 12,
                "priority": PriorityEnum.high,
                "status": StatusEnum.in_progress,
                "created_offset": 120,
            },
            {
                "public_code": "DR-1002",
                "tracking_code": "TRK-KOTH02",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.other,
                "description": "Fallen banyan tree blocking arterial Karve Road near Vanaz Metro Station. Overhead power lines snapped and sparking across highway.",
                "address": "Near Vanaz Metro Station, Karve Road, Kothrud, Pune",
                "latitude": 18.5088,
                "longitude": 73.8105,
                "people_affected": 3,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.assigned,
                "created_offset": 90,
            },
            {
                "public_code": "DR-1003",
                "tracking_code": "TRK-KOTH03",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.medical,
                "description": "Boundary wall collapse near MIT World Peace University rear gate due to heavy rain. Two college students sustained limb fractures.",
                "address": "MIT College Back Road, Paud Road, Kothrud, Pune",
                "latitude": 18.5175,
                "longitude": 73.8152,
                "people_affected": 2,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.under_review,
                "created_offset": 45,
            },
            {
                "public_code": "DR-1004",
                "tracking_code": "TRK-KOTH04",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.food_water,
                "description": "Drinking water supply pipeline breached by stormwater drain mixing at Mayur Colony. Over 45 households without clean drinking water.",
                "address": "Mayur Colony, near Joggers Park, Kothrud, Pune",
                "latitude": 18.5021,
                "longitude": 73.8190,
                "people_affected": 45,
                "priority": PriorityEnum.high,
                "status": StatusEnum.reported,
                "created_offset": 15,
            },

            # ── HINJAWADI (5-8)
            {
                "public_code": "DR-1005",
                "tracking_code": "TRK-HINJ01",
                "reporter_id": priya_user.id,
                "category": CategoryEnum.rescue,
                "description": "Flash flooding at Shivaji Chowk underpass. A private employee transport bus is submerged up to window level with 8 passengers trapped inside.",
                "address": "Shivaji Chowk, Hinjawadi Phase 1, Pune",
                "latitude": 18.5910,
                "longitude": 73.7392,
                "people_affected": 8,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.in_progress,
                "created_offset": 150,
            },
            {
                "public_code": "DR-1006",
                "tracking_code": "TRK-HINJ02",
                "reporter_id": priya_user.id,
                "category": CategoryEnum.other,
                "description": "Electrical transformer explosion and localized chemical hazard blaze near Phase 1 IT Park entrance gate.",
                "address": "Phase 1 Entrance, Hinjawadi Rajiv Gandhi Infotech Park, Pune",
                "latitude": 18.5880,
                "longitude": 73.7420,
                "people_affected": 5,
                "priority": PriorityEnum.high,
                "status": StatusEnum.assigned,
                "created_offset": 80,
            },
            {
                "public_code": "DR-1007",
                "tracking_code": "TRK-HINJ03",
                "reporter_id": priya_user.id,
                "category": CategoryEnum.shelter,
                "description": "Construction labor camp inundated near Megapolis Circle Phase 3. 30 migrant workers and children displaced without dry shelter.",
                "address": "Megapolis Circle, Phase 3, Hinjawadi, Pune",
                "latitude": 18.5785,
                "longitude": 73.7020,
                "people_affected": 30,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.reported,
                "created_offset": 30,
            },
            {
                "public_code": "DR-1008",
                "tracking_code": "TRK-HINJ04",
                "reporter_id": priya_user.id,
                "category": CategoryEnum.food_water,
                "description": "Food rations and clean drinking water depleted at stranded tech park security campus near Wipro Circle.",
                "address": "Wipro Circle, Phase 2, Hinjawadi, Pune",
                "latitude": 18.5955,
                "longitude": 73.7290,
                "people_affected": 25,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.under_review,
                "created_offset": 20,
            },

            # ── BANER (9-12)
            {
                "public_code": "DR-1009",
                "tracking_code": "TRK-BANR01",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.rescue,
                "description": "Major road cave-in on Balewadi High Street during sudden cloudburst. Sedan car fell into 8-foot sinkhole with 2 occupants inside.",
                "address": "Balewadi High Street, near Cummins India, Baner, Pune",
                "latitude": 18.5630,
                "longitude": 73.7820,
                "people_affected": 2,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.assigned,
                "created_offset": 100,
            },
            {
                "public_code": "DR-1010",
                "tracking_code": "TRK-BANR02",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.medical,
                "description": "Elderly patient on oxygen concentrator cut off by waist-deep water on Pancard Club Road. Power outage imminent with battery low.",
                "address": "Pancard Club Road, Baner, Pune",
                "latitude": 18.5540,
                "longitude": 73.7890,
                "people_affected": 1,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.in_progress,
                "created_offset": 70,
            },
            {
                "public_code": "DR-1011",
                "tracking_code": "TRK-BANR03",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.food_water,
                "description": "Low-lying settlements near Ram Nadi culvert flooded. 50 people evacuated to higher ground requiring immediate drinking water and dry snacks.",
                "address": "Ram Nadi Culvert, Baner Road, Pune",
                "latitude": 18.5580,
                "longitude": 73.7940,
                "people_affected": 50,
                "priority": PriorityEnum.high,
                "status": StatusEnum.reported,
                "created_offset": 55,
            },
            {
                "public_code": "DR-1012",
                "tracking_code": "TRK-BANR04",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.shelter,
                "description": "Tin roof sheeting blown off multiple shanties near Veerbhadra Nagar due to high winds and rain. Emergency tarp distribution completed.",
                "address": "Veerbhadra Nagar, Baner, Pune",
                "latitude": 18.5690,
                "longitude": 73.7760,
                "people_affected": 15,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.resolved,
                "created_offset": 240,
            },

            # ── WAKAD (13-16)
            {
                "public_code": "DR-1013",
                "tracking_code": "TRK-WAKD01",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.rescue,
                "description": "Massive stormwater surge at Bhumkar Chowk subway. Four small vehicles floating with 6 people clinging to overhead signboard.",
                "address": "Bhumkar Chowk Subway, Wakad, Pune",
                "latitude": 18.5985,
                "longitude": 73.7610,
                "people_affected": 6,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.in_progress,
                "created_offset": 130,
            },
            {
                "public_code": "DR-1014",
                "tracking_code": "TRK-WAKD02",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.medical,
                "description": "Contaminated floodwater seepage into underground borewell tank at residential society on Datta Mandir Road causing severe vomiting outbreak.",
                "address": "Datta Mandir Road, Wakad, Pimpri-Chinchwad, Pune",
                "latitude": 18.5960,
                "longitude": 73.7690,
                "people_affected": 18,
                "priority": PriorityEnum.high,
                "status": StatusEnum.under_review,
                "created_offset": 60,
            },
            {
                "public_code": "DR-1015",
                "tracking_code": "TRK-WAKD03",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.shelter,
                "description": "Displaced daily wage families requiring immediate temporary bedding and shelter at Kaspate Vasti open ground.",
                "address": "Kaspate Vasti, Wakad, Pune",
                "latitude": 18.5925,
                "longitude": 73.7735,
                "people_affected": 22,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.assigned,
                "created_offset": 95,
            },
            {
                "public_code": "DR-1016",
                "tracking_code": "TRK-WAKD04",
                "reporter_id": cit_user.id,
                "category": CategoryEnum.other,
                "description": "High tension electric pole tilted precariously over school bus route near Wakad-Hinjawadi Flyover.",
                "address": "Near Hinjawadi-Wakad Flyover, Wakad, Pune",
                "latitude": 18.6015,
                "longitude": 73.7580,
                "people_affected": 4,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.reported,
                "created_offset": 10,
            },

            # ── AUNDH (17-20)
            {
                "public_code": "DR-1017",
                "tracking_code": "TRK-AUND01",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.rescue,
                "description": "Mula River water backflow flooding ground floors of riverside societies along DP Road. 20 senior citizens awaiting boat evacuation.",
                "address": "DP Road, near Riverside Society, Aundh, Pune",
                "latitude": 18.5645,
                "longitude": 73.8055,
                "people_affected": 20,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.in_progress,
                "created_offset": 110,
            },
            {
                "public_code": "DR-1018",
                "tracking_code": "TRK-AUND02",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.medical,
                "description": "Emergency transport needed for chronic kidney disease patient stranded on Sanghavi Bridge approach road with road submerged.",
                "address": "Old Sanghavi Bridge Approach, Aundh, Pune",
                "latitude": 18.5680,
                "longitude": 73.8010,
                "people_affected": 1,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.assigned,
                "created_offset": 65,
            },
            {
                "public_code": "DR-1019",
                "tracking_code": "TRK-AUND03",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.other,
                "description": "Blocked stormwater culvert causing knee-deep water on Parihar Chowk market road. Debris clearing machinery deployed and road cleared.",
                "address": "Parihar Chowk Commercial Area, Aundh, Pune",
                "latitude": 18.5605,
                "longitude": 73.8035,
                "people_affected": 8,
                "priority": PriorityEnum.low,
                "status": StatusEnum.resolved,
                "created_offset": 300,
            },
            {
                "public_code": "DR-1020",
                "tracking_code": "TRK-AUND04",
                "reporter_id": ananya_user.id,
                "category": CategoryEnum.food_water,
                "description": "Community kitchen ration shortage for displaced slum settlement along Sindh Society boundary wall.",
                "address": "Sindh Society Outer Perimeter, Aundh, Pune",
                "latitude": 18.5560,
                "longitude": 73.8090,
                "people_affected": 35,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.reported,
                "created_offset": 40,
            },

            # ── SINHAGAD ROAD (21-25)
            {
                "public_code": "DR-1021",
                "tracking_code": "TRK-SINH01",
                "reporter_id": rahul_user.id,
                "category": CategoryEnum.rescue,
                "description": "Mutha River right bank canal breach near Manik Baug. Rapid floodwaters entered ground-floor apartments; 16 residents stranded on rooftop.",
                "address": "Near Manik Baug Canal Road, Sinhagad Road, Pune",
                "latitude": 18.4735,
                "longitude": 73.8245,
                "people_affected": 16,
                "priority": PriorityEnum.critical,
                "status": StatusEnum.in_progress,
                "created_offset": 140,
            },
            {
                "public_code": "DR-1022",
                "tracking_code": "TRK-SINH02",
                "reporter_id": rahul_user.id,
                "category": CategoryEnum.other,
                "description": "Mudslide from Parvati-Sinhagad hill ridge near Vadgaon Budruk blocking access road to Anand Nagar high-rise society.",
                "address": "Vadgaon Budruk, Sinhagad Road, Pune",
                "latitude": 18.4680,
                "longitude": 73.8290,
                "people_affected": 10,
                "priority": PriorityEnum.high,
                "status": StatusEnum.assigned,
                "created_offset": 85,
            },
            {
                "public_code": "DR-1023",
                "tracking_code": "TRK-SINH03",
                "reporter_id": rahul_user.id,
                "category": CategoryEnum.medical,
                "description": "Cluster of acute water-borne illnesses reported at relief camp near Anand Nagar bridge. Medical triage team and IV fluids urgently needed.",
                "address": "Anand Nagar Bridge, Sinhagad Road, Pune",
                "latitude": 18.4770,
                "longitude": 73.8210,
                "people_affected": 14,
                "priority": PriorityEnum.high,
                "status": StatusEnum.under_review,
                "created_offset": 50,
            },
            {
                "public_code": "DR-1024",
                "tracking_code": "TRK-SINH04",
                "reporter_id": rahul_user.id,
                "category": CategoryEnum.food_water,
                "description": "40 flood evacuees housed in local school near Dhayari Phata lacking clean water bottles and baby food milk packets.",
                "address": "Dhayari Phata, Sinhagad Road, Pune",
                "latitude": 18.4650,
                "longitude": 73.8320,
                "people_affected": 40,
                "priority": PriorityEnum.high,
                "status": StatusEnum.reported,
                "created_offset": 25,
            },
            {
                "public_code": "DR-1025",
                "tracking_code": "TRK-SINH05",
                "reporter_id": rahul_user.id,
                "category": CategoryEnum.shelter,
                "description": "Nanded City approach road waterlogged; 28 temporary displaced workers need emergency tarpaulins and dry floor mats.",
                "address": "Nanded City Road, Sinhagad Road, Pune",
                "latitude": 18.4550,
                "longitude": 73.8215,
                "people_affected": 28,
                "priority": PriorityEnum.medium,
                "status": StatusEnum.reported,
                "created_offset": 12,
            },
        ]

        created_incidents = []
        for inc_data in incidents_data:
            created_time = _now() - timedelta(minutes=inc_data["created_offset"])
            incident = Incident(
                public_code=inc_data["public_code"],
                tracking_code=inc_data["tracking_code"],
                reporter_id=inc_data["reporter_id"],
                category=inc_data["category"],
                description=inc_data["description"],
                address=inc_data["address"],
                latitude=inc_data["latitude"],
                longitude=inc_data["longitude"],
                people_affected=inc_data["people_affected"],
                priority=inc_data["priority"],
                status=inc_data["status"],
                created_at=created_time,
                updated_at=created_time,
            )
            db.add(incident)
            await db.flush()
            created_incidents.append(incident)

            # Seed initial status history
            history_init = StatusHistory(
                incident_id=incident.id,
                old_status="reported",
                new_status="reported",
                changed_by=inc_data["reporter_id"],
                note="Emergency incident logged by citizen reporter",
                created_at=created_time,
            )
            db.add(history_init)

            # Additional status histories for non-reported states
            if inc_data["status"] in (StatusEnum.assigned, StatusEnum.in_progress, StatusEnum.resolved):
                h_assigned = StatusHistory(
                    incident_id=incident.id,
                    old_status="reported",
                    new_status="assigned",
                    changed_by=admin_user.id,
                    note="Assigned to municipal emergency field response unit",
                    created_at=created_time + timedelta(minutes=10),
                )
                db.add(h_assigned)

            if inc_data["status"] in (StatusEnum.in_progress, StatusEnum.resolved):
                h_progress = StatusHistory(
                    incident_id=incident.id,
                    old_status="assigned",
                    new_status="in_progress",
                    changed_by=resp_user.id,
                    note="Rescue team arrived on site; operations underway",
                    created_at=created_time + timedelta(minutes=20),
                )
                db.add(h_progress)

            if inc_data["status"] == StatusEnum.resolved:
                h_resolved = StatusHistory(
                    incident_id=incident.id,
                    old_status="in_progress",
                    new_status="resolved",
                    changed_by=resp_user.id,
                    note="Operations successfully completed. Area declared safe.",
                    created_at=created_time + timedelta(minutes=60),
                )
                db.add(h_resolved)

            # Seed user notification for this incident
            notif = Notification(
                user_id=inc_data["reporter_id"],
                incident_id=incident.id,
                type="incident_logged",
                title=f"Incident {inc_data['public_code']} Recorded",
                message=f"Your emergency request ({inc_data['category'].value}) at {inc_data['address']} is currently {inc_data['status'].value}.",
                is_read=False,
                created_at=created_time,
            )
            db.add(notif)

        await db.commit()
        logger.info("[SUCCESS] Pune disaster seed data created successfully!")
        logger.info(
            "Seeded: %d users, %d response teams, %d places, %d incidents",
            len(users_data),
            len(teams_data),
            len(places_data),
            len(incidents_data),
        )


seed = seed_data


if __name__ == "__main__":
    asyncio.run(seed_data())
