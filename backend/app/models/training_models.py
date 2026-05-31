import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class TrainingStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TrainingMode(str, enum.Enum):
    SINGLE_GPU = "single_gpu"
    MULTI_GPU = "multi_gpu"
    DISTRIBUTED = "distributed"


class ModelArchitecture(str, enum.Enum):
    YOLO11 = "yolo11"
    YOLOV10 = "yolov10"
    RT_DETR = "rt_detr"
    FASTER_RCNN = "faster_rcnn"
    EFFICIENTDET = "efficientdet"


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    model_definition_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("model_definitions.id"))
    dataset_version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("dataset_versions.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    architecture: Mapped[ModelArchitecture] = mapped_column(Enum(ModelArchitecture))
    training_mode: Mapped[TrainingMode] = mapped_column(Enum(TrainingMode), default=TrainingMode.SINGLE_GPU)
    status: Mapped[TrainingStatus] = mapped_column(Enum(TrainingStatus), default=TrainingStatus.PENDING)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    hpo_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    project = relationship("Project", back_populates="training_jobs")
    metrics: Mapped[list["TrainingMetric"]] = relationship(back_populates="training_job")
    trials: Mapped[list["HyperparameterTrial"]] = relationship(back_populates="training_job")
    artifact: Mapped["ModelArtifact | None"] = relationship(back_populates="training_job", uselist=False)


class TrainingMetric(Base):
    __tablename__ = "training_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    training_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("training_jobs.id"), nullable=False)
    epoch: Mapped[int] = mapped_column(Integer, nullable=False)
    loss: Mapped[float | None] = mapped_column(Float)
    precision: Mapped[float | None] = mapped_column(Float)
    recall: Mapped[float | None] = mapped_column(Float)
    f1: Mapped[float | None] = mapped_column(Float)
    map50: Mapped[float | None] = mapped_column(Float)
    map50_95: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    training_job = relationship("TrainingJob", back_populates="metrics")


class HyperparameterTrial(Base):
    __tablename__ = "hyperparameter_trials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    training_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("training_jobs.id"), nullable=False)
    trial_number: Mapped[int] = mapped_column(Integer, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="running")
    is_best: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    training_job = relationship("TrainingJob", back_populates="trials")


class ModelLifecycle(str, enum.Enum):
    REGISTERED = "registered"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"


class ModelArtifact(Base):
    __tablename__ = "model_artifacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    training_job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("training_jobs.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    architecture: Mapped[str] = mapped_column(String(50), nullable=False)
    lifecycle: Mapped[ModelLifecycle] = mapped_column(Enum(ModelLifecycle), default=ModelLifecycle.REGISTERED)
    minio_weights_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    minio_onnx_key: Mapped[str | None] = mapped_column(String(1024))
    dataset_version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("dataset_versions.id"))
    classes_used: Mapped[list] = mapped_column(JSONB, default=list)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    gpu_used: Mapped[str | None] = mapped_column(String(100))
    training_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    model_size_mb: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    training_job = relationship("TrainingJob", back_populates="artifact")
    evaluations: Mapped[list["EvaluationResult"]] = relationship(back_populates="model_artifact")
    deployments: Mapped[list["Deployment"]] = relationship(back_populates="model_artifact")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_artifact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("model_artifacts.id"), nullable=False)
    precision: Mapped[float | None] = mapped_column(Float)
    recall: Mapped[float | None] = mapped_column(Float)
    map50: Mapped[float | None] = mapped_column(Float)
    map50_95: Mapped[float | None] = mapped_column(Float)
    fps: Mapped[float | None] = mapped_column(Float)
    inference_ms: Mapped[float | None] = mapped_column(Float)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    model_artifact = relationship("ModelArtifact", back_populates="evaluations")
