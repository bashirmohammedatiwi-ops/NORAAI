"""Per-class healthy (negative) image samples — no bbox = سليمة within class."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class ClassSampleType(str, enum.Enum):
    NEGATIVE_HEALTHY = "negative_healthy"


class ClassImageSample(Base):
    """Image registered as healthy (no defect) for a specific class — used in training as empty labels."""

    __tablename__ = "class_image_samples"
    __table_args__ = (UniqueConstraint("image_id", "class_id", name="uq_class_image_sample"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    sample_type: Mapped[ClassSampleType] = mapped_column(
        Enum(ClassSampleType), default=ClassSampleType.NEGATIVE_HEALTHY
    )
    source: Mapped[str] = mapped_column(String(50), default="upload")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    image = relationship("Image")
    class_label = relationship("ClassLabel")
