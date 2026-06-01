from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Operations Center"
    app_env: str = "development"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    database_url: str = "postgresql+asyncpg://aiops:aiops_secret@localhost:5432/aiops"
    database_url_sync: str = "postgresql://aiops:aiops_secret@localhost:5432/aiops"

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "aiops-data"
    minio_secure: bool = False

    quality_score_threshold: int = 40
    active_learning_confidence_threshold: float = 0.70

    cuda_visible_devices: str = "0"
    training_cpu_fallback: bool = True

    prometheus_enabled: bool = True

    admin_email: str = "admin@aiops.com"
    admin_password: str = "admin123"

    # Google Maps Platform — Roads API (speed limits on map-matched roads)
    google_maps_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
