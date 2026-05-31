import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base_models import utcnow
from app.core.database import Base


class IngestionSourceType(str, enum.Enum):
    VEHICLE_DEVICE = "vehicle_device"
    MOBILE_APP = "mobile_app"
    TRAFFIC_CAMERA = "traffic_camera"
    MANUAL_UPLOAD = "manual_upload"
    GOVERNMENT_CAMERA = "government_camera"
    DRONE_CAMERA = "drone_camera"


class ImageStatus(str, enum.Enum):
    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"
    FLAGGED = "flagged"


class Image(Base):
    __tablename__ = "images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phash: Mapped[str | None] = mapped_column(String(32), index=True)
    minio_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    status: Mapped[ImageStatus] = mapped_column(Enum(ImageStatus), default=ImageStatus.PENDING)
    source_type: Mapped[IngestionSourceType] = mapped_column(Enum(IngestionSourceType))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="images")
    quality_score: Mapped["ImageQualityScore | None"] = relationship(back_populates="image", uselist=False)
    annotations: Mapped[list["Annotation"]] = relationship(back_populates="image")
    ingestion_records: Mapped[list["IngestionRecord"]] = relationship(back_populates="image")


class ImageQualityScore(Base):
    __tablename__ = "image_quality_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id"), unique=True, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    blur_score: Mapped[float] = mapped_column(Float, default=0)
    brightness_score: Mapped[float] = mapped_column(Float, default=0)
    resolution_score: Mapped[float] = mapped_column(Float, default=0)
    is_corrupted: Mapped[bool] = mapped_column(Boolean, default=False)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    image = relationship("Image", back_populates="quality_score")


class IngestionRecord(Base):
    __tablename__ = "ingestion_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("images.id"))
    source_type: Mapped[IngestionSourceType] = mapped_column(Enum(IngestionSourceType))
    source_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default="processing")
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    image = relationship("Image", back_populates="ingestion_records")


class IngestionSourceConfig(Base):
    __tablename__ = "ingestion_source_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_type: Mapped[IngestionSourceType] = mapped_column(Enum(IngestionSourceType))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
