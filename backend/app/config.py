"""
Application configuration loaded from environment variables.
All secrets / connection strings come from the environment so the
same image can run locally or on AWS without code changes.
"""

from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Environment ───────────────────────────────────────────
    ENV: str = "development"
    USE_AWS: bool = False

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://disaster_user:disaster_pass@localhost:5432/disaster_db"

    # ── JWT ───────────────────────────────────────────────────
    SECRET_KEY: str = "local-dev-secret-key-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── AWS Settings ──────────────────────────────────────────
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = ""
    SQS_QUEUE_URL: str = ""
    SNS_TOPIC_ARN: str = ""

    # ── Internal Service Authentication (Lambda -> API) ──────
    INTERNAL_TOKEN: str = "dev-internal-triage-token-change-in-prod"

    model_config = {
        "env_file": (".env", "../.env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def validate_production_settings(self):
        if self.ENV == "production":
            insecure_keys = {
                "change-me",
                "local-dev-secret-key-change-in-prod",
                "disaster-insecure-dev-secret-key-change-in-prod",
                "secret",
                "password",
                "",
            }
            if (
                not self.SECRET_KEY
                or self.SECRET_KEY in insecure_keys
                or "change-in-prod" in self.SECRET_KEY.lower()
            ):
                raise ValueError(
                    "In production (ENV=production), a strong, custom SECRET_KEY must be configured via environment."
                )
            if self.USE_AWS and not self.S3_BUCKET_NAME:
                raise ValueError("S3_BUCKET_NAME must be set when USE_AWS=true in production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
