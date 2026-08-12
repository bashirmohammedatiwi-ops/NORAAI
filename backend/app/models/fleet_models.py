import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class FleetDevice(Base):
    __tablename__ = "fleet_devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    vehicle_id: Mapped[str] = mapped_column(String(100), nullable=False)
    api_key: Mapped[str] = mapped_column(String(255), nullable=False)
    gps_status: Mapped[str] = mapped_column(String(50), default="unknown")
    camera_status: Mapped[str] = mapped_column(String(50), default="unknown")
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    last_communication: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="fleet_devices")
    telemetry: Mapped[list["DeviceTelemetry"]] = relationship(back_populates="device")


class DeviceTelemetry(Base):
    __tablename__ = "device_telemetry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fleet_devices.id"), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    gps_status: Mapped[str | None] = mapped_column(String(50))
    camera_status: Mapped[str | None] = mapped_column(String(50))
    speed: Mapped[float | None] = mapped_column(Float)
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    device = relationship("FleetDevice", back_populates="telemetry")


class RoadEventType(str, enum.Enum):
    ACCIDENT = "accident"
    POTHOLE = "pothole"
    SPEED_BUMP = "speed_bump"
    ROAD_CRACK = "road_crack"
    BARRIER = "barrier"
    ROAD_CLOSED = "road_closed"
    TRAFFIC_VIOLATION = "traffic_violation"
    CONSTRUCTION = "construction"
    FLOODED_ROAD = "flooded_road"


class RoadEvent(Base):
    __tablename__ = "road_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("fleet_devices.id"))
    event_type: Mapped[RoadEventType] = mapped_column(Enum(RoadEventType))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReportFormat(str, enum.Enum):
    PDF = "pdf"
    EXCEL = "excel"


class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    format: Mapped[ReportFormat] = mapped_column(Enum(ReportFormat))
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.PENDING)
    report_type: Mapped[str] = mapped_column(String(50), default="custom")
    date_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    date_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    minio_key: Mapped[str | None] = mapped_column(String(1024))
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
