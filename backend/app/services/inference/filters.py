"""Post-processing rules for YOLO detections."""

from __future__ import annotations

from app.core.config import Settings, get_settings


def bbox_area(bbox: list[float]) -> float:
    if len(bbox) < 4:
        return 0.0
    x1, y1, x2, y2 = bbox[:4]
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def effective_confidence_threshold(
    class_count: int,
    min_confidence: float | None = None,
    settings: Settings | None = None,
) -> float:
    cfg = settings or get_settings()
    if min_confidence is not None:
        return max(0.05, min(0.99, float(min_confidence)))
    if class_count <= 1:
        return cfg.inference_single_class_confidence
    return cfg.inference_confidence_threshold


def filter_detections(
    detections: list[dict],
    *,
    class_count: int,
    min_confidence: float | None = None,
    settings: Settings | None = None,
) -> tuple[list[dict], float, list[str]]:
    """
    Drop low-confidence boxes and apply stricter rules for single-class / full-frame boxes.
    Returns (filtered, threshold_used, warnings).
    """
    cfg = settings or get_settings()
    threshold = effective_confidence_threshold(class_count, min_confidence, cfg)
    warnings: list[str] = []

    if class_count <= 1:
        warnings.append(
            "Single-class model: add 30–50% normal/background images (no labels) and retrain "
            "to reduce false alarms on images without accidents."
        )

    kept: list[dict] = []
    for det in detections:
        conf = float(det.get("confidence") or 0)
        if conf < threshold:
            continue

        area = bbox_area(det.get("bbox") or [])
        if class_count <= 1 and area >= cfg.inference_full_frame_area_threshold:
            if conf < cfg.inference_full_frame_min_confidence:
                continue

        kept.append(det)

    return kept, threshold, warnings
