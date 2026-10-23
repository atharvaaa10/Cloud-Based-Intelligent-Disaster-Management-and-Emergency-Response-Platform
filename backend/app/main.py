"""
FastAPI application entry point.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, incidents, teams, resources

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(
    title="Disaster Management & Emergency Response Platform",
    version="0.1.0",
    description="Cloud-Based Intelligent Disaster Management and Emergency Response Platform",
)

# ── CORS ──────────────────────────────────────────────────────
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(incidents.router)
app.include_router(teams.router)
app.include_router(resources.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
