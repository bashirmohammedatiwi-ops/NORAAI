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

    # Inference — reduce false positives (especially single-class accident models)
    inference_confidence_threshold: float = 0.35
    inference_single_class_confidence: float = 0.55
    inference_iou_threshold: float = 0.45
    inference_full_frame_area_threshold: float = 0.45
    inference_full_frame_min_confidence: float = 0.94

    vehicle_detector_weights: str = "yolo11s.pt"
    vehicle_detector_imgsz: int = 416
    vehicle_detector_conf: float = 0.25

    # Fleet / camera inference performance
    inference_imgsz: int = 416
    inference_manual_test_augment: bool = True
    inference_manual_test_conf: float = 0.01
    inference_device: str = "cpu"
    inference_use_half: bool = False
    inference_model_cache_size: int = 6
    inference_max_two_stage_vehicles: int = 2
    inference_skip_vehicle_multipass: bool = True
    driver_inference_simple: bool = True

    # Driver app capture tuning (returned via /driver/config)
    driver_scan_interval_ms: int = 750
    driver_scan_interval_fast_ms: int = 450
    driver_speed_fast_kmh: float = 35.0
    driver_capture_max_width: int = 768
    driver_jpeg_quality: float = 0.78

    # Duplicate event suppression (periodic camera frames)
    event_dedup_cooldown_seconds: int = 90
    event_dedup_radius_meters: float = 80.0

    # YOLO dataset ZIP import (streamed to MinIO)
    yolo_import_max_bytes: int = 4 * 1024 * 1024 * 1024

    cuda_visible_devices: str = "0"
    # Prefer CPU for training (VPS without NVIDIA). Real CPU training — not simulated metrics.
    training_cpu_fallback: bool = True
    # Only for dev/demo: fake metrics when YOLO crashes. Keep false in production.
    training_mock_on_failure: bool = False
    training_device: str = "auto"
    training_cpu_threads: int = 0
    training_auto_batch: bool = True
    training_speed_boost: bool = True
    training_hostinger_mode: bool = False
    training_val_every: int = 0
    training_skip_onnx_export: bool = True
    training_export_max_workers: int = 0
    training_export_cache_enabled: bool = True
    training_ram_cache_budget_mb: int = 4096
    training_disk_cache_min_images: int = 12000
    static_frontend_dir: str = ""
    desktop_mode: bool = False

    prometheus_enabled: bool = True

    # Production tuning (small VPS)
    api_uvicorn_workers: int = 1
    celery_ingestion_concurrency: int = 2
    db_pool_size: int = 5
    db_max_overflow: int = 10

    admin_email: str = "admin@aiops.com"
    admin_password: str = "admin123"

    # Google Maps Platform — Roads API (speed limits on map-matched roads)
    google_maps_api_key: str = ""

    # Cloud Run YOLO predict API (Ultralytics dedicated endpoint)
    cloud_predict_url: str = "https://predict-6a7b9e67b578285046a4f04c-dproatj77a-og.a.run.app"
    cloud_predict_api_key: str = "ul_ee95205eef2428d95e72b5c42acd29dbc84f37a6"
    cloud_predict_conf: float = 0.25
    cloud_predict_iou: float = 0.7
    cloud_predict_imgsz: int = 640

    evidence_upload_dir: str = "uploads/evidence"
    demo_images_dir: str = "demo_images"


@lru_cache
def get_settings() -> Settings:
    return Settings()
