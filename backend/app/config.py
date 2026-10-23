"""
Application configuration loaded from environment variables.
All secrets / connection strings come from the environment so the
same image can run locally or on AWS without code changes.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://disaster_user:disaster_pass@localhost:5432/disaster_db"

    # ── JWT ───────────────────────────────────────────────────
    SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── AWS (stubs for now) ───────────────────────────────────
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = ""
    SQS_QUEUE_URL: str = ""
    SNS_TOPIC_ARN: str = ""

    model_config = {"env_file": (".env", "../.env"), "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
