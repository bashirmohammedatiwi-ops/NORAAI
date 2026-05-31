import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_models import utcnow


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    head_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="datasets")
    versions: Mapped[list["DatasetVersion"]] = relationship(back_populates="dataset")
    branches: Mapped[list["DatasetBranch"]] = relationship(back_populates="dataset")


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    version_tag: Mapped[str] = mapped_column(String(50), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("dataset_branches.id"))
    manifest: Mapped[dict] = mapped_column(JSONB, default=dict)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    class_manifest: Mapped[dict] = mapped_column(JSONB, default=dict)
    parent_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    dataset = relationship("Dataset", back_populates="versions")
    branch = relationship("DatasetBranch", back_populates="versions")
    images: Mapped[list["DatasetImage"]] = relationship(back_populates="version")


class DatasetBranch(Base):
    __tablename__ = "dataset_branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    head_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    dataset = relationship("Dataset", back_populates="branches")
    versions: Mapped[list["DatasetVersion"]] = relationship(back_populates="branch")


class DatasetImage(Base):
    __tablename__ = "dataset_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dataset_versions.id"), nullable=False)
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    version = relationship("DatasetVersion", back_populates="images")
    image = relationship("Image")


class DatasetVersionDiff(Base):
    __tablename__ = "dataset_version_diffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    from_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dataset_versions.id"), nullable=False)
    to_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dataset_versions.id"), nullable=False)
    diff_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
