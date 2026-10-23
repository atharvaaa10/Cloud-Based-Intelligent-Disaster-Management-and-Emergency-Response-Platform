#!/bin/sh
set -e

echo "[STARTUP] Running database migrations via Alembic..."
python -m alembic upgrade head

echo "[STARTUP] Starting FastAPI server via Uvicorn..."
exec "$@"
