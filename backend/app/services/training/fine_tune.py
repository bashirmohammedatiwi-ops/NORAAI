"""Load active project weights for continuous / fine-tune training."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes
from app.models import ModelArtifact
from app.services.driver.project_classes import is_production_model
from app.services.models.active_model import get_active_model_sync

YOLO_FINE_TUNE_ARCHITECTURES = frozenset({"yolo11", "yolov10", "rt_detr"})


def should_fine_tune(config: dict) -> bool:
    return bool(config.get("fine_tune_from_active") or config.get("continuous"))


def apply_fine_tune_training_overrides(config: dict) -> dict:
    """Lower LR and longer mosaic for stable fine-tuning on existing weights."""
    out = dict(config)
    if not should_fine_tune(out):
        return out
    if out.get("fine_tune_from_active"):
        out["learning_rate"] = min(float(out.get("learning_rate", 0.01)), 0.002)
        out["warmup_epochs"] = max(int(out.get("warmup_epochs", 0)), 3)
        out["patience"] = max(int(out.get("patience", 10)), 12)
        out["close_mosaic"] = max(int(out.get("close_mosaic", 3)), 5)
        if out.get("augmentation") == "heavy":
            out["augmentation"] = "medium"
    return out


def resolve_fine_tune_weights_path(
    session: Session,
    project_id: uuid.UUID,
    job_architecture: str,
    config: dict,
    *,
    work_dir: str,
) -> tuple[str | None, str, str | None]:
    """
    Returns (local_weights_path, source_tag, warning_message).
    source_tag: base | main_model | skipped
    """
    if not should_fine_tune(config):
        return None, "base", None

    if job_architecture not in YOLO_FINE_TUNE_ARCHITECTURES:
        return None, "base", f"Fine-tune not supported for {job_architecture}"

    artifact: ModelArtifact | None = get_active_model_sync(session, project_id)
    if not artifact or not is_production_model(artifact):
        if config.get("fine_tune_from_active"):
            return None, "base", "No production Main Model — starting from pretrained weights"
        return None, "base", None

    if artifact.architecture != job_architecture:
        return (
            None,
            "base",
            f"Active model is {artifact.architecture} but job is {job_architecture} — using pretrained base",
        )

    try:
        weights_bytes = download_bytes(artifact.minio_weights_key)
    except Exception as exc:
        return None, "base", f"Could not load Main Model weights: {exc}"

    if not weights_bytes or weights_bytes == b"mock_weights":
        return None, "base", "Main Model weights invalid — using pretrained base"

    weights_dir = Path(work_dir) / "fine_tune_base"
    weights_dir.mkdir(parents=True, exist_ok=True)
    weights_path = str(weights_dir / "main_model.pt")
    Path(weights_path).write_bytes(weights_bytes)
    return weights_path, "main_model", None
