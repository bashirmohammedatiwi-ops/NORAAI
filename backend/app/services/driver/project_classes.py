"""Project classes and active model checks for driver inference."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ClassLabel, ModelArtifact


def normalize_class_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def normalize_classes_used(raw: object) -> list[str]:
    """Coerce JSONB classes_used to a list (legacy jobs stored a single class name as str)."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if x is not None and str(x).strip()]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if "," in text:
            return [part.strip() for part in text.split(",") if part.strip()]
        return [text]
    return []


async def get_project_classes(db: AsyncSession, project_id: uuid.UUID) -> list[ClassLabel]:
    result = await db.execute(
        select(ClassLabel).where(
            ClassLabel.project_id == project_id,
            ClassLabel.is_archived == False,
        ).order_by(ClassLabel.created_at, ClassLabel.name)
    )
    return list(result.scalars().all())


def is_production_model(artifact: ModelArtifact | None) -> bool:
    """True when artifact has real trained weights (not mock training)."""
    if not artifact or not artifact.minio_weights_key:
        return False
    metrics = artifact.metrics or {}
    if metrics.get("mock"):
        return False
    return True


def model_class_names(artifact: ModelArtifact) -> list[str]:
    return normalize_classes_used(artifact.classes_used)


def allowed_detection_classes(
    project_classes: list[ClassLabel],
    artifact: ModelArtifact | None,
) -> list[str]:
    """Class names the driver may detect: intersection of dashboard classes and model output labels."""
    project_names = {normalize_class_name(c.name) for c in project_classes}
    names = normalize_classes_used(artifact.classes_used) if artifact else []
    if not artifact or not names:
        return sorted({c.name for c in project_classes})
    allowed: list[str] = []
    for name in names:
        if normalize_class_name(name) in project_names:
            allowed.append(name)
    return allowed
