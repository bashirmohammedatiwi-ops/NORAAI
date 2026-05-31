import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class DeploymentTarget(str, enum.Enum):
    VPS = "vps"
    EDGE = "edge"
    RASPBERRY_PI = "raspberry_pi"
    DOCKER = "docker"
    REST_API = "rest_api"


class DeploymentStatus(str, enum.Enum):
    TESTING = "testing"
    STAGING = "staging"
    ACTIVE = "active"
    ARCHIVED = "archived"


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    model_artifact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("model_artifacts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target: Mapped[DeploymentTarget] = mapped_column(Enum(DeploymentTarget))
    status: Mapped[DeploymentStatus] = mapped_column(Enum(DeploymentStatus), default=DeploymentStatus.TESTING)
    endpoint_url: Mapped[str | None] = mapped_column(String(1024))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="deployments")
    model_artifact = relationship("ModelArtifact", back_populates="deployments")
    inference_logs: Mapped[list["InferenceLog"]] = relationship(back_populates="deployment")
    drift_alerts: Mapped[list["DriftAlert"]] = relationship(back_populates="deployment")


class InferenceLog(Base):
    __tablename__ = "inference_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deployments.id"), nullable=False)
    input_hash: Mapped[str | None] = mapped_column(String(64))
    predictions: Mapped[dict] = mapped_column(JSONB, default=dict)
    confidence: Mapped[float | None] = mapped_column(Float)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    is_false_positive: Mapped[bool] = mapped_column(Boolean, default=False)
    is_false_negative: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    deployment = relationship("Deployment", back_populates="inference_logs")


class DriftAlertType(str, enum.Enum):
    ACCURACY = "accuracy"
    DATA = "data"
    CONFIDENCE = "confidence"


class DriftAlert(Base):
    __tablename__ = "drift_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deployments.id"), nullable=False)
    alert_type: Mapped[DriftAlertType] = mapped_column(Enum(DriftAlertType))
    severity: Mapped[str] = mapped_column(String(20), default="warning")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    deployment = relationship("Deployment", back_populates="drift_alerts")
