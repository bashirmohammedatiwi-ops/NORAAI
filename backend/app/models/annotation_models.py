import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class AnnotationStatus(str, enum.Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    EDITED = "edited"


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id"), nullable=False)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("classes.id"), nullable=False)
    x_center: Mapped[float] = mapped_column(Float, nullable=False)
    y_center: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    height: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[AnnotationStatus] = mapped_column(Enum(AnnotationStatus), default=AnnotationStatus.PENDING_REVIEW)
    source: Mapped[str] = mapped_column(String(50), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    image = relationship("Image", back_populates="annotations")
    class_label = relationship("ClassLabel")
    reviews: Mapped[list["AnnotationReview"]] = relationship(back_populates="annotation")


class AnnotationReview(Base):
    __tablename__ = "annotation_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    annotation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("annotations.id"), nullable=False)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    annotation = relationship("Annotation", back_populates="reviews")


class ActiveLearningStatus(str, enum.Enum):
    NEEDS_REVIEW = "needs_review"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"


class ActiveLearningQueue(Base):
    __tablename__ = "active_learning_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id"), nullable=False)
    model_artifact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("model_artifacts.id"))
    uncertainty_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    entropy: Mapped[float | None] = mapped_column(Float)
    status: Mapped[ActiveLearningStatus] = mapped_column(
        Enum(ActiveLearningStatus), default=ActiveLearningStatus.NEEDS_REVIEW
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
