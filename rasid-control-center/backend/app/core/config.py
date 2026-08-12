from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def backend_root() -> Path:
    return _BACKEND_ROOT


def resolve_data_path(relative: str) -> Path:
    path = Path(relative)
    return path if path.is_absolute() else _BACKEND_ROOT / path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "NURAI Dashboard API"
    app_env: str = "production"
    secret_key: str = "nurai-change-me-in-production"
    access_token_expire_minutes: int = 480
    refresh_token_expire_days: int = 14

    database_url: str = "postgresql+asyncpg://nurai:nurai_secret@postgres:5432/nurai"
    redis_url: str = "redis://redis:6379/0"

    admin_email: str = "admin@aiops.com"
    admin_password: str = "admin123"

    demo_images_dir: str = "demo_images"
    evidence_upload_dir: str = "uploads/evidence"
    models_upload_dir: str = "uploads/models"

    cloud_predict_url: str = "https://predict-6a7b9e67b578285046a4f04c-dproatj77a-og.a.run.app"
    cloud_predict_api_key: str = "ul_ee95205eef2428d95e72b5c42acd29dbc84f37a6"

    db_pool_size: int = 10
    db_max_overflow: int = 20


@lru_cache
def get_settings() -> Settings:
    return Settings()
