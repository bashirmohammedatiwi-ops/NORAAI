from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("Invalid email address")
        return v


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
    model_artifact_id: UUID


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

    model_config = {"from_attributes": True}


class ModelArtifactResponse(BaseModel):
    id: UUID
    name: str
    architecture: str
    lifecycle: str
    metrics: dict
    model_size_mb: float | None
    created_at: datetime

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


class FleetDeviceResponse(BaseModel):
    id: UUID
    device_id: str
    vehicle_id: str
    gps_status: str
    camera_status: str
    is_online: bool
    latitude: float | None
    longitude: float | None
    last_communication: datetime | None

    model_config = {"from_attributes": True}


class TelemetryRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    gps_status: str = "ok"
    camera_status: str = "ok"
    speed: float | None = None


class RoadEventCreate(BaseModel):
    event_type: str
    latitude: float
    longitude: float
    confidence: float | None = None


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
