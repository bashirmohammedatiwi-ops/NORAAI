"""Resolve YOLO class names from trained weights — source of truth at inference."""

from __future__ import annotations


def names_from_yolo_model(model) -> list[str]:
    raw = getattr(model, "names", None)
    if raw is None:
        return []
    if isinstance(raw, dict):
        try:
            keys = sorted(raw.keys(), key=lambda k: int(k))
        except (TypeError, ValueError):
            keys = sorted(raw.keys())
        return [str(raw[k]) for k in keys]
    if isinstance(raw, (list, tuple)):
        return [str(n) for n in raw]
    return []


def get_weights_class_names(
    weights_key: str,
    weights_bytes: bytes,
    *,
    architecture: str = "yolo11",
) -> list[str]:
    from app.services.inference.model_cache import get_cached_yolo

    model = get_cached_yolo(weights_key, weights_bytes, architecture=architecture)
    return names_from_yolo_model(model)
