"""Full-image detection with precise vehicle-only boxes."""

from __future__ import annotations

from app.core.config import Settings
from app.services.driver.project_classes import normalize_class_name
from app.services.inference.filters import filter_detections
from ml.detection.class_taxonomy import detection_mode, is_damage_class, is_road_class
from ml.detection.two_stage import classify_vehicles_two_stage
from ml.detection.vehicle_localizer import (
    align_damage_detections_to_vehicles,
    build_vehicle_detector_predictions,
    detect_vehicles,
    format_detected_vehicles,
    pick_vehicle_display_class,
    snap_candidates_to_vehicles,
)


def _item_to_candidate(
    item: dict,
    class_names: list[str],
    allowed_norm: set[str],
    *,
    strict_allowlist: bool = True,
) -> dict | None:
    from app.services.driver.detection import map_class_to_event

    from app.services.inference.class_display import resolve_display_class_name

    name = item.get("class_name")
    if not name and class_names:
        idx = int(item.get("class_id", 0))
        if 0 <= idx < len(class_names):
            name = class_names[idx]
    if not name:
        return None
    if class_names:
        name = resolve_display_class_name(name, class_names)
    if strict_allowlist and allowed_norm and normalize_class_name(name) not in allowed_norm:
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
        "x_center": cx,
        "y_center": cy,
        "width": w,
        "height": h,
        "vehicle_type": item.get("vehicle_type"),
        "vehicle_confidence": item.get("vehicle_confidence"),
        "pipeline": item.get("pipeline", "localized"),
    }


def _needs_precise_vehicles(class_names: list[str]) -> bool:
    if not any(detection_mode(name) in ("damage", "vehicle") for name in class_names):
        return False
    if all(is_road_class(name) for name in class_names):
        return False
    return True


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
    Road defects: project model on full image.
    Accident/vehicle: COCO vehicle boxes; show vehicles even when model confidence is low.
    """
    yolo_conf = min(0.15, settings.inference_confidence_threshold)
    class_modes = {detection_mode(n) for n in class_names}
    has_road = "road" in class_modes or any(is_road_class(n) for n in class_names)
    has_damage = "damage" in class_modes or any(is_damage_class(n) for n in class_names)
    needs_vehicles = _needs_precise_vehicles(class_names)

    vehicles: list[dict] = []
    if needs_vehicles:
        vehicles = detect_vehicles(
            image_path,
            conf=settings.vehicle_detector_conf,
            iou=settings.inference_iou_threshold,
            imgsz=settings.vehicle_detector_imgsz,
        )

    candidates: list[dict] = []
    pipeline = "localized"

    raw_full = adapter.predict(
        weights_path,
        image_path,
        conf=yolo_conf,
        iou=settings.inference_iou_threshold,
    )
    for item in raw_full:
        cand = _item_to_candidate(item, class_names, allowed_norm)
        if cand:
            candidates.append(cand)

    if needs_vehicles and vehicles:
        ts_items, vehicles = classify_vehicles_two_stage(
            image_path,
            weights_path,
            adapter,
            yolo_conf=0.08,
            iou=settings.inference_iou_threshold,
            vehicle_conf=settings.vehicle_detector_conf,
            vehicles=vehicles,
        )
        for item in ts_items:
            cand = _item_to_candidate(item, class_names, allowed_norm)
            if cand and cand["detection_mode"] in ("damage", "vehicle"):
                candidates.append(cand)
        if ts_items:
            pipeline = "two_stage_vehicle"

    if needs_vehicles and vehicles:
        candidates = snap_candidates_to_vehicles(candidates, vehicles, require_vehicle=False)
        if pipeline == "localized":
            pipeline = "vehicle_precise"
    elif has_damage and candidates:
        candidates, vehicles = align_damage_detections_to_vehicles(
            image_path,
            candidates,
            iou=settings.inference_iou_threshold,
            vehicle_conf=settings.vehicle_detector_conf,
            vehicles=vehicles or None,
        )

    class_count = max(len(class_names), 1)
    predictions, threshold, warnings = filter_detections(
        candidates,
        class_count=class_count,
        min_confidence=min_confidence,
        settings=settings,
    )

    vehicle_display_class = pick_vehicle_display_class(class_names, allowed_norm)
    detected_vehicles = format_detected_vehicles(vehicles)

    if needs_vehicles and vehicles and not predictions and vehicle_display_class:
        vehicle_preds = build_vehicle_detector_predictions(
            vehicles, class_name=vehicle_display_class,
        )
        v_floor = max(0.15, settings.vehicle_detector_conf - 0.08)
        predictions = [p for p in vehicle_preds if float(p["confidence"]) >= v_floor]
        if predictions:
            pipeline = "vehicle_detector"
            warnings = [
                w for w in warnings
                if "did not classify" not in w and "Vehicle / accident boxes come" not in w
            ]
            warnings.append(
                f"Showing {len(predictions)} vehicle(s) from detector. "
                f"Accident class did not reach {threshold * 100:.0f}% — refine labels or retrain."
            )

    tips: list[str] = []
    if has_damage or needs_vehicles:
        tips.append("Vehicles: detector finds cars; trained model answers accident yes/no.")
    if has_road:
        tips.append("Road: model detects potholes, cracks, and surface defects on the pavement.")
    if needs_vehicles and not vehicles:
        tips.append("No vehicle found in this image.")

    return predictions, {
        "confidence_threshold": threshold,
        "class_count": class_count,
        "raw_detection_count": len(candidates),
        "vehicle_count": len(vehicles),
        "detected_vehicles": detected_vehicles,
        "pipeline": pipeline,
        "warnings": list(warnings) + tips,
        "detection_modes": sorted(class_modes),
    }


def detect_simple_with_project_model(
    image_source: str | bytes,
    weights_path: str,
    adapter,
    class_names: list[str],
    allowed_norm: set[str],
    *,
    settings: Settings,
    min_confidence: float | None = None,
    imgsz: int | None = None,
    high_accuracy: bool = False,
) -> tuple[list[dict], dict]:
    """Direct YOLO on full image — single pass, optimized for camera / manual test."""
    predict_imgsz = imgsz or settings.inference_imgsz
    yolo_conf = (
        min(0.01, settings.inference_manual_test_conf)
        if high_accuracy
        else min(0.02, settings.inference_manual_test_conf * 2)
    )
    raw = adapter.predict(
        weights_path,
        image_source,
        conf=yolo_conf,
        iou=settings.inference_iou_threshold,
        imgsz=predict_imgsz,
        high_accuracy=high_accuracy,
    )
    candidates: list[dict] = []
    for item in raw:
        cand = _item_to_candidate(item, class_names, allowed_norm, strict_allowlist=False)
        if cand:
            candidates.append(cand)

    threshold = min_confidence if min_confidence is not None else 0.01
    threshold = max(0.01, min(0.99, float(threshold)))
    predictions = [c for c in candidates if float(c.get("confidence") or 0) >= threshold]
    best_conf = max((float(c.get("confidence") or 0) for c in candidates), default=0.0)
    return predictions, {
        "confidence_threshold": threshold,
        "raw_detection_count": len(candidates),
        "best_confidence": best_conf,
        "all_candidates": candidates,
        "pipeline": "simple_high_accuracy" if high_accuracy else "simple",
        "high_accuracy": high_accuracy,
        "inference_imgsz": predict_imgsz,
    }
