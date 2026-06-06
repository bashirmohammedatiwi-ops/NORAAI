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


def inherit_config_from_artifact(config: dict, artifact: ModelArtifact) -> dict:
    """Align training resolution and preset with the active production model."""
    from app.services.driver.project_classes import model_class_names

    out = dict(config)
    metrics = artifact.metrics or {}
    old_nc = len(model_class_names(artifact))
    new_nc = int(config.get("_training_class_count") or 0)
    multiclass_expansion = new_nc > old_nc > 0

    if multiclass_expansion:
        out["_multiclass_expansion"] = True

    if (
        metrics.get("image_size")
        and not out.get("_image_size_locked")
        and not out.get("_large_dataset")
        and not multiclass_expansion
    ):
        out["image_size"] = int(metrics["image_size"])

    if artifact.architecture and not out.get("architecture_locked"):
        out["_artifact_architecture"] = artifact.architecture

    prior_map = metrics.get("map50_95")
    if (
        prior_map is not None
        and float(prior_map) < 0.2
        and not out.get("_large_dataset")
        and not multiclass_expansion
    ):
        out["epochs"] = max(int(out.get("epochs", 20)), 25)
    return out


def apply_fine_tune_training_overrides(config: dict, *, from_main_model: bool = False) -> dict:
    """Lower LR, freeze backbone layers, and stabilize aug for fine-tuning."""
    if not should_fine_tune(config):
        return config

    train_n = int(config.get("_train_images") or 0)
    large = bool(config.get("_large_dataset") or train_n >= 3000 or config.get("_multiclass_expansion"))
    prioritize = bool(config.get("_prioritize_accuracy"))

    if config.get("fine_tune_from_active"):
        config["learning_rate"] = min(float(config.get("learning_rate", 0.01)), 0.0015)
        if large and not prioritize:
            config["warmup_epochs"] = min(int(config.get("warmup_epochs", 0)), 1)
            config["patience"] = min(int(config.get("patience", 10)), 8)
            config["close_mosaic"] = min(int(config.get("close_mosaic", 3)), 2)
        else:
            config["warmup_epochs"] = max(int(config.get("warmup_epochs", 0)), 3)
            config["patience"] = max(int(config.get("patience", 10)), 15)
            config["close_mosaic"] = max(int(config.get("close_mosaic", 3)), 8)
        config["lrf"] = min(float(config.get("lrf", 0.01)), 0.008)
        if not prioritize and config.get("augmentation") in ("heavy", "medium"):
            config["augmentation"] = "light"
        if from_main_model:
            if large and not prioritize:
                config["freeze_layers"] = min(int(config.get("freeze_layers", 10)), 3)
            else:
                config["freeze_layers"] = int(config.get("freeze_layers", 10))
                config["label_smoothing"] = float(config.get("label_smoothing", 0.05))
    return config


def recommend_preset(has_production_model: bool, can_fine_tune: bool) -> str:
    if has_production_model and can_fine_tune:
        return "ultimate_accuracy"
    return "ultimate_accuracy"


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

    inherited = inherit_config_from_artifact(config, artifact)
    for key, val in inherited.items():
        if key.startswith("_"):
            config[key] = val
            continue
        if key in ("image_size", "epochs") and val is not None:
            config[key] = val

    weights_dir = Path(work_dir) / "fine_tune_base"
    weights_dir.mkdir(parents=True, exist_ok=True)
    weights_path = str(weights_dir / "main_model.pt")
    Path(weights_path).write_bytes(weights_bytes)
    return weights_path, "main_model", None
