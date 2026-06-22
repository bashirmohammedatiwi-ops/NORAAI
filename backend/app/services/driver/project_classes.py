"""Project classes and active model checks for driver inference."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ClassLabel, ModelArtifact
from app.services.driver.rdd_classes import rdd_class_color
from app.services.driver.roboflow_classes import roboflow_class_color
from app.services.models.artifact_weights import artifact_has_onnx, artifact_has_pt_weights


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


async def ensure_project_classes(
    db: AsyncSession,
    project_id: uuid.UUID,
    class_names: list[str],
) -> list[ClassLabel]:
    """Create dashboard ClassLabel rows for model classes that are not in the project yet."""
    if not class_names:
        return await get_project_classes(db, project_id)
    existing = await get_project_classes(db, project_id)
    known = {normalize_class_name(c.name) for c in existing}
    default_colors = ("#3B82F6", "#F97316", "#22C55E", "#EAB308", "#8B5CF6", "#64748B")
    added = 0
    for raw in class_names:
        name = raw.strip()
        if not name:
            continue
        key = normalize_class_name(name)
        if key in known:
            continue
        color = (
            rdd_class_color(name)
            or roboflow_class_color(name)
            or default_colors[added % len(default_colors)]
        )
        db.add(ClassLabel(project_id=project_id, name=name, color=color))
        known.add(key)
        added += 1
    if added:
        await db.flush()
    return await get_project_classes(db, project_id) if added else existing


async def get_project_classes(db: AsyncSession, project_id: uuid.UUID) -> list[ClassLabel]:
    result = await db.execute(
        select(ClassLabel).where(
            ClassLabel.project_id == project_id,
            ClassLabel.is_archived == False,
        ).order_by(ClassLabel.created_at, ClassLabel.name)
    )
    return list(result.scalars().all())


def is_production_model(artifact: ModelArtifact | None) -> bool:
    """True when artifact has real trained weights or deployable ONNX (not mock training)."""
    if not artifact:
        return False
    metrics = artifact.metrics or {}
    if metrics.get("mock"):
        return False
    if artifact_has_pt_weights(artifact):
        return True
    return artifact_has_onnx(artifact)


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
    if allowed:
        return allowed
    # Imported external weights (e.g. RDD YOLO12) — model labels may not exist in dashboard yet.
    metrics = artifact.metrics or {}
    if metrics.get("imported"):
        return list(names)
    return allowed
