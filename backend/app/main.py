"""
FastAPI application entry point.
"""

from datetime import datetime, timezone
import json
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.routers import auth, incidents, teams, resources, internal, admin, places, response_teams, notifications, uploads, citizen, map as map_router


class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as structured JSON for CloudWatch log ingestion."""
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


settings = get_settings()
is_production = settings.ENV == "production"

# Configure root logger with JSON formatting in production
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
for handler in list(root_logger.handlers):
    root_logger.removeHandler(handler)

console_handler = logging.StreamHandler(sys.stdout)
if is_production:
    console_handler.setFormatter(StructuredJsonFormatter())
else:
    console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify settings on startup (validates production requirements)
    logger.info("[STARTUP] Starting in %s mode (USE_AWS=%s)", settings.ENV, settings.USE_AWS)
    yield

app = FastAPI(
    title="Disaster Management & Emergency Response Platform",
    version="0.2.0",
    description="Cloud-Based Intelligent Disaster Management and Emergency Response Platform",
    lifespan=lifespan,
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
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
app.include_router(places.router)
app.include_router(response_teams.router)
app.include_router(notifications.router)
app.include_router(uploads.router)
app.include_router(internal.router)
app.include_router(admin.router)
app.include_router(citizen.router)
app.include_router(map_router.router)


@app.get("/health", tags=["monitoring"])
async def health(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint (no auth required).
    Checks database connectivity for load balancers and container orchestrators.
    """
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "environment": settings.ENV,
            "aws_enabled": settings.USE_AWS,
        }
    except Exception as e:
        logger.error("[HEALTH] Database check failed: %s", e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "degraded",
                "database": "disconnected",
                "error": str(e),
            },
        )
