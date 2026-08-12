from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: str) -> str:
        return v.strip()


class RefreshRequest(BaseModel):
    refresh_token: str


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "viewer"

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("Invalid email address")
        return v


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    domain: str = "computer_vision"


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    domain: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectListItemResponse(ProjectResponse):
    has_model: bool = False


class ProjectOverviewResponse(BaseModel):
    project: ProjectResponse
    model_status: dict


class DashboardHomeResponse(BaseModel):
    stats: dict
    projects: list[ProjectListItemResponse]
    active_training: list["ActiveTrainingJobResponse"] = []


class ActiveTrainingJobResponse(BaseModel):
    job_id: str
    project_id: str
    project_name: str
    name: str
    architecture: str
    status: str
    progress: int = 0
    current_epoch: int = 0
    total_epochs: int = 0
    phase: str | None = None
    message: str | None = None
    batch: int | None = None
    total_batches: int | None = None
    epoch_progress: int | None = None
    export_current: int | None = None
    export_total: int | None = None
    current_step: int | None = None
    total_steps: int | None = None
    duration_seconds: int | None = None
    eta_seconds: int | None = None
    epoch_elapsed_seconds: int | None = None
    epoch_eta_seconds: int | None = None
    batches_per_min: float | None = None
    sec_per_batch: float | None = None
    device_label: str = "CPU Training"
    latest_metrics: dict | None = None


class ModelDefinitionCreate(BaseModel):
    name: str
    task_type: str = "detection"
    description: str | None = None


class ModelDefinitionResponse(BaseModel):
    id: UUID
    name: str
    task_type: str
    description: str | None

    model_config = {"from_attributes": True}


class ClassCreate(BaseModel):
    name: str
    color: str = "#3B82F6"


class ClassUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class ClassMergeRequest(BaseModel):
    source_class_ids: list[UUID]
    target_class_id: UUID


class ClassResponse(BaseModel):
    id: UUID
    name: str
    color: str
    is_archived: bool

    model_config = {"from_attributes": True}


class IngestionUploadResponse(BaseModel):
    record_id: UUID
    status: str


class ImageResponse(BaseModel):
    id: UUID
    filename: str
    status: str
    source_type: str
    quality_score: float | None = None
    width: int | None = None
    height: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetCreate(BaseModel):
    name: str
    description: str | None = None


class DatasetSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    head_version_id: UUID | None = None
    version_tag: str | None = None
    image_count: int = 0


class AddImagesToDatasetRequest(BaseModel):
    image_ids: list[UUID]


class DatasetUploadResponse(BaseModel):
    dataset_id: UUID
    record_ids: list[UUID]
    status: str
    message: str
    class_id: UUID | None = None


class YoloUploadResponse(BaseModel):
    upload_id: str
    size_bytes: int
    message: str


class YoloImportPreviewResponse(BaseModel):
    image_count: int
    labeled_count: int
    raw_image_files: int = 0
    raw_label_files: int = 0
    detected_class_ids: list[int]
    yolo_class_names: list[str]
    suggested_mapping: dict[str, str] = Field(default_factory=dict)
    warning: str | None = None
    valid: bool = True


class YoloImportStartResponse(BaseModel):
    task_id: str
    status: str
    message: str


class YoloImportStatusResponse(BaseModel):
    task_id: str
    state: str
    progress: int = 0
    imported: int = 0
    annotations: int = 0
    failed: int = 0
    training_job_id: str | None = None
    error: str | None = None
    result: dict | None = None


class DatasetBuilderStatsResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str
    head_version_id: UUID | None = None
    image_count: int = 0
    annotated_count: int = 0
    ready_for_training: bool = False
    unlabeled_count: int = 0
    per_class: list[dict] = Field(default_factory=list)


class ClassOnImageResponse(BaseModel):
    class_id: UUID
    name: str
    color: str


class AnnotationOnImageResponse(BaseModel):
    id: UUID
    class_id: UUID
    class_name: str
    class_color: str
    x_center: float
    y_center: float
    width: float
    height: float
    confidence: float | None = None
    status: str
    source: str


class DatasetImageDetailResponse(BaseModel):
    id: UUID
    filename: str
    status: str
    source_type: str
    quality_score: float | None = None
    width: int | None = None
    height: int | None = None
    created_at: datetime
    classes: list[ClassOnImageResponse] = Field(default_factory=list)
    annotations: list[AnnotationOnImageResponse] = Field(default_factory=list)
    is_annotated: bool = False


class DatasetGalleryResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str
    description: str | None = None
    head_version_id: UUID | None = None
    total: int = 0
    limit: int = 48
    offset: int = 0
    class_filter: UUID | None = None
    unlabeled_only: bool = False
    unlabeled_count: int = 0
    per_class: list[dict] = Field(default_factory=list)
    items: list[DatasetImageDetailResponse] = Field(default_factory=list)


class DatasetVersionCreate(BaseModel):
    version_tag: str
    image_ids: list[UUID] = Field(default_factory=list)
    branch_name: str = "main"


class DatasetDiffResponse(BaseModel):
    added_images: list[str]
    removed_images: list[str]
    added_classes: list[str]
    removed_classes: list[str]


class AnnotationCreate(BaseModel):
    class_id: UUID
    x_center: float
    y_center: float
    width: float
    height: float


class AnnotationUpdate(BaseModel):
    class_id: UUID | None = None
    x_center: float | None = None
    y_center: float | None = None
    width: float | None = None
    height: float | None = None


class AnnotationResponse(BaseModel):
    id: UUID
    image_id: UUID
    class_id: UUID
    x_center: float
    y_center: float
    width: float
    height: float
    confidence: float | None
    status: str

    model_config = {"from_attributes": True}


class AutoLabelRequest(BaseModel):
    project_id: UUID
    image_ids: list[UUID]
    model_artifact_id: UUID | None = None


class RetrainConfigOverrides(BaseModel):
    """Optional hyperparameter overrides when retraining / strengthening the Main Model."""

    batch_size: int | str | None = None
    learning_rate: float | None = Field(None, gt=0, le=1.0)
    image_size: int | None = Field(None, ge=320, le=1280)
    augmentation: str | None = Field(None, pattern="^(none|light|medium|heavy)$")
    patience: int | None = Field(None, ge=1, le=100)
    val_split: float | None = Field(None, gt=0, lt=0.5)
    optimizer: str | None = None
    scheduler: str | None = None


class TrainingJobCreate(BaseModel):
    name: str
    architecture: str = "yolo11"
    training_mode: str = "single_gpu"
    model_definition_id: UUID | None = None
    dataset_version_id: UUID | None = None
    hpo_enabled: bool = False
    config: dict = Field(default_factory=dict)


class TrainingJobResponse(BaseModel):
    id: UUID
    name: str
    architecture: str
    status: str
    hpo_enabled: bool
    created_at: datetime
    error_message: str | None = None
    progress: int | None = None
    current_epoch: int | None = None
    total_epochs: int | None = None

    model_config = {"from_attributes": True}


class ModelArtifactResponse(BaseModel):
    id: UUID
    name: str
    architecture: str
    lifecycle: str
    metrics: dict
    model_size_mb: float | None
    created_at: datetime
    classes_used: list[str] = Field(default_factory=list)
    model_number: int = 0
    is_active: bool = False

    @classmethod
    def from_artifact(
        cls,
        artifact,
        *,
        model_number: int = 0,
        is_active: bool = False,
    ) -> "ModelArtifactResponse":
        from app.services.driver.project_classes import model_class_names

        return cls(
            id=artifact.id,
            name=artifact.name,
            architecture=artifact.architecture,
            lifecycle=artifact.lifecycle.value if hasattr(artifact.lifecycle, "value") else str(artifact.lifecycle),
            metrics=artifact.metrics or {},
            model_size_mb=artifact.model_size_mb,
            created_at=artifact.created_at,
            classes_used=model_class_names(artifact),
            model_number=model_number,
            is_active=is_active,
        )

    model_config = {"from_attributes": True}


class ModelCompareRequest(BaseModel):
    model_ids: list[UUID]


class DeploymentCreate(BaseModel):
    name: str
    model_artifact_id: UUID
    target: str
    config: dict = Field(default_factory=dict)


class DeploymentResponse(BaseModel):
    id: UUID
    name: str
    target: str
    status: str
    endpoint_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FleetDeviceCreate(BaseModel):
    device_id: str
    vehicle_id: str
    driver_name: str | None = None


class FleetDeviceResponse(BaseModel):
    id: UUID
    device_id: str
    vehicle_id: str
    driver_name: str | None = None
    gps_status: str
    camera_status: str
    is_online: bool
    latitude: float | None
    longitude: float | None
    last_communication: datetime | None

    model_config = {"from_attributes": True}


class FleetDeviceRegisterResponse(FleetDeviceResponse):
    api_key: str
    project_id: UUID


class TelemetryRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    gps_status: str = "ok"
    camera_status: str = "ok"
    speed: float | None = None
    app_version: str | None = None
    model_version: str | None = None
    model_sha256: str | None = None
    driver_name: str | None = None


class RoadEventCreate(BaseModel):
    event_type: str
    latitude: float
    longitude: float
    confidence: float | None = None
    metadata: dict | None = None


class PasswordConfirmRequest(BaseModel):
    password: str = Field(min_length=1)


class DeleteResultResponse(BaseModel):
    deleted: str
    message: str | None = None


class DriverAlertType(BaseModel):
    type: str
    label: str
    label_ar: str
    color: str
    class_name: str | None = None


class DriverProjectClass(BaseModel):
    id: UUID
    name: str
    color: str


class SpeedViolationConfig(BaseModel):
    enabled: bool = True
    tolerance_kmh: float = Field(default=5, ge=0, le=30)
    grace_seconds: float = Field(default=3, ge=0, le=60)
    cooldown_seconds: int = Field(default=60, ge=5, le=3600)
    fallback_limit_kmh: float = Field(default=80, ge=10, le=200)


class MobileCameraConfig(BaseModel):
    max_width: int = Field(default=640, ge=320, le=1280)
    jpeg_quality: float = Field(default=0.72, ge=0.3, le=1.0)


class MobileAppConfig(BaseModel):
    inference_mode: str = Field(default="local", pattern="^(local|server)$")
    detection_enabled: bool = True
    min_confidence: float = Field(default=0.45, ge=0.1, le=1.0)
    scan_fps: int = Field(default=12, ge=1, le=30)
    speed_violation: SpeedViolationConfig = Field(default_factory=SpeedViolationConfig)
    camera: MobileCameraConfig = Field(default_factory=MobileCameraConfig)


class MobileAppConfigPatch(BaseModel):
    inference_mode: str | None = Field(default=None, pattern="^(local|server)$")
    detection_enabled: bool | None = None
    min_confidence: float | None = Field(default=None, ge=0.1, le=1.0)
    scan_fps: int | None = Field(default=None, ge=1, le=30)
    speed_violation: SpeedViolationConfig | None = None
    camera: MobileCameraConfig | None = None


class DriverModelManifest(BaseModel):
    artifact_id: UUID
    model_name: str
    architecture: str
    version: str
    sha256: str
    format: str = "onnx"
    image_size: int
    resize_mode: str = "letterbox"
    nc: int
    classes: list[str]
    model_size_mb: float | None = None
    model_bytes: int | None = None
    updated_at: str
    download_url: str | None = None


class SyncDriverModelRequest(BaseModel):
    model_artifact_id: UUID
    promote_as_active: bool = False


class SyncDriverModelResponse(BaseModel):
    status: str
    manifest: DriverModelManifest


class MobileDeviceStatus(BaseModel):
    id: UUID
    device_id: str
    vehicle_id: str
    gps_status: str
    camera_status: str
    is_online: bool
    latitude: float | None
    longitude: float | None
    last_communication: datetime | None
    app_version: str | None = None
    model_version: str | None = None
    model_sha256: str | None = None
    last_sync_at: str | None = None


class MobileCommandStatus(BaseModel):
    project_id: UUID
    driver_model_artifact_id: UUID | None
    active_model_artifact_id: UUID | None
    model_ready: bool
    deployment: dict | None = None
    mobile_config: dict
    devices_online: int
    devices_total: int
    violations_today: int
    events_today: int


class DriverSpeedViolationRequest(BaseModel):
    latitude: float
    longitude: float
    speed: float
    speed_limit: float
    road_name: str | None = None
    duration_seconds: float | None = None


class DriverConfigResponse(BaseModel):
    project_id: UUID
    device_id: str
    vehicle_id: str
    model_ready: bool
    model_name: str | None
    model_artifact_id: UUID | None = None
    model_version: str | None = None
    model_sha256: str | None = None
    model_classes: list[str] = []
    project_classes: list[DriverProjectClass] = []
    classes: list[str]
    alert_types: list[DriverAlertType]
    speed_limit_kmh: float = 80
    road_speed_enabled: bool = False
    detection_enabled: bool = False
    inference_mode: str = "local"
    min_confidence: float = 0.45
    scan_fps: int = 12
    speed_violation: SpeedViolationConfig = Field(default_factory=SpeedViolationConfig)
    message: str | None = None
    scan_interval_ms: int = 2000
    scan_interval_fast_ms: int = 1200
    speed_fast_kmh: float = 40.0
    capture_max_width: int = 640
    jpeg_quality: float = 0.72


class DriverSpeedLimitResponse(BaseModel):
    speed_limit_kmh: float
    source: str
    road_speed_available: bool
    place_id: str | None = None
    road_name: str | None = None
    highway_type: str | None = None


class DriverDetectionReportItem(BaseModel):
    class_name: str
    confidence: float
    bbox: list[float]
    event_type: str | None = None


class DriverReportDetectionsRequest(BaseModel):
    latitude: float
    longitude: float
    detections: list[DriverDetectionReportItem]
    min_confidence: float | None = None


class DriverDetectResponse(BaseModel):
    detections: list[dict]
    alerts: list[dict]
    events_created: int
    model_ready: bool = True
    message: str | None = None
    latency_ms: float | None = None
    pipeline: str | None = None


class DriverNearbyEvent(BaseModel):
    id: UUID
    event_type: str
    latitude: float
    longitude: float
    confidence: float | None
    distance_km: float
    metadata: dict | None = None


class ReportCreate(BaseModel):
    name: str
    format: str = "pdf"
    report_type: str = "custom"
    date_from: datetime | None = None
    date_to: datetime | None = None


class ReportResponse(BaseModel):
    id: UUID
    name: str
    format: str
    status: str
    minio_key: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
