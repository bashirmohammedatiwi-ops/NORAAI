"""Resolve inference parameters from trained model metadata."""

from __future__ import annotations

from app.core.config import Settings, get_settings
from app.models import ModelArtifact


def resolve_inference_imgsz(
    artifact: ModelArtifact | None,
    settings: Settings | None = None,
    *,
    manual_test: bool = False,
) -> int:
    cfg = settings or get_settings()
    if artifact and artifact.metrics:
        training_sz = artifact.metrics.get("image_size")
        if training_sz:
            return int(training_sz)
    if manual_test:
        return max(cfg.inference_imgsz, 640)
    return cfg.inference_imgsz


def resolve_manual_test_confidence(
    artifact: ModelArtifact | None,
    settings: Settings | None = None,
) -> float:
    """Low default for manual test so users see raw model output."""
    cfg = settings or get_settings()
    class_count = len(artifact.classes_used or []) if artifact else 0
    if class_count <= 1:
        return min(0.35, cfg.inference_single_class_confidence)
    return min(0.25, cfg.inference_confidence_threshold)
