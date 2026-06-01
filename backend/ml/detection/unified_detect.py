"""Full-image localized detection + optional two-stage fallback for legacy models."""

from __future__ import annotations

from app.core.config import Settings
from app.services.driver.project_classes import normalize_class_name
from app.services.inference.filters import filter_detections
from ml.detection.class_taxonomy import detection_mode, is_damage_class, is_road_class
from ml.detection.dual_vehicle_damage import append_vehicle_predictions, enrich_damage_detections
from ml.detection.two_stage import classify_vehicles_two_stage


def _item_to_candidate(item: dict, class_names: list[str], allowed_norm: set[str]) -> dict | None:
    from app.services.driver.detection import map_class_to_event

    idx = int(item.get("class_id", 0))
    name = class_names[idx] if idx < len(class_names) else f"class_{idx}"
    if normalize_class_name(name) not in allowed_norm:
        return None

    cx = float(item.get("x_center", 0.5))
    cy = float(item.get("y_center", 0.5))
    w = float(item.get("width", 0.2))
    h = float(item.get("height", 0.2))

    event_type = map_class_to_event(name)
    mode = detection_mode(name)
    return {
        "class": name,
        "detection_mode": mode,
        "event_type": event_type.value if event_type else None,
        "confidence": float(item.get("confidence", 0.0)),
        "bbox": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
        "vehicle_bbox": item.get("vehicle_bbox"),
        "vehicle_type": item.get("vehicle_type"),
        "vehicle_confidence": item.get("vehicle_confidence"),
        "pipeline": item.get("pipeline", "localized"),
    }


def detect_with_project_model(
    image_path: str,
    weights_path: str,
    adapter,
    class_names: list[str],
    allowed_norm: set[str],
    *,
    settings: Settings,
    min_confidence: float | None = None,
) -> tuple[list[dict], dict]:
    """
    Primary: YOLO on full image (localized boxes for potholes, damage regions, etc.).
    Fallback: two-stage vehicle crop for old single-class accident models only.
    """
    yolo_conf = min(0.2, settings.inference_confidence_threshold)
    raw_full = adapter.predict(
        weights_path,
        image_path,
        conf=yolo_conf,
        iou=settings.inference_iou_threshold,
    )

    candidates: list[dict] = []
    for item in raw_full:
        cand = _item_to_candidate(item, class_names, allowed_norm)
        if cand:
            candidates.append(cand)

    vehicles: list[dict] = []
    pipeline = "localized"

    class_modes = {detection_mode(n) for n in class_names}
    has_road = "road" in class_modes or any(is_road_class(n) for n in class_names)
    has_damage = "damage" in class_modes or any(is_damage_class(n) for n in class_names)

    use_two_stage_fallback = (
        not candidates
        and len(class_names) <= 2
        and (has_damage or "accident" in {normalize_class_name(n) for n in class_names})
    )

    if use_two_stage_fallback:
        ts_items, vehicles = classify_vehicles_two_stage(
            image_path,
            weights_path,
            adapter,
            yolo_conf=yolo_conf,
            iou=settings.inference_iou_threshold,
            vehicle_conf=0.35,
        )
        for item in ts_items:
            cand = _item_to_candidate(item, class_names, allowed_norm)
            if cand:
                cand["pipeline"] = "two_stage"
                candidates.append(cand)
        if candidates:
            pipeline = "two_stage"

    if has_damage and candidates:
        candidates, vehicles = enrich_damage_detections(
            image_path,
            candidates,
            vehicles=vehicles or None,
            vehicle_conf=0.35,
            iou=settings.inference_iou_threshold,
        )
        candidates = append_vehicle_predictions(candidates, class_names, allowed_norm)
        if vehicles and pipeline == "localized":
            pipeline = "dual_vehicle_damage"

    class_count = max(len(class_names), 1)
    predictions, threshold, warnings = filter_detections(
        candidates,
        class_count=class_count,
        min_confidence=min_confidence,
        settings=settings,
    )

    tips: list[str] = []
    if has_damage:
        tips.append(
            "Accident/damage: blue dashed box = vehicle, red box = damaged part (glass, bumper, panel). "
            "Refine both in Annotation, then retrain."
        )
    if has_road:
        tips.append(
            "Potholes/road defects: label each pothole or crack with its own box on the road surface."
        )
    if not vehicles and has_damage and not predictions:
        tips.append(
            "No damage region detected. Retrain with boxes drawn on the damaged part of the vehicle."
        )

    return predictions, {
        "confidence_threshold": threshold,
        "class_count": class_count,
        "raw_detection_count": len(candidates),
        "vehicle_count": len(vehicles),
        "pipeline": pipeline,
        "warnings": list(warnings) + tips,
        "detection_modes": sorted(class_modes),
    }
