"""Detect cars/trucks on an image using COCO-pretrained YOLO."""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.core.config import get_settings
from ml.detection.class_taxonomy import detection_mode

# COCO indices in Ultralytics YOLO
COCO_VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck

_vehicle_model = None
MIN_VEHICLE_AREA = 0.006
MAX_VEHICLE_AREA = 0.92


def _get_vehicle_model():
    global _vehicle_model
    if _vehicle_model is None:
        from ultralytics import YOLO

        settings = get_settings()
        weights = getattr(settings, "vehicle_detector_weights", "yolo11s.pt")
        try:
            _vehicle_model = YOLO(weights)
        except Exception:
            _vehicle_model = YOLO("yolo11n.pt")
    return _vehicle_model


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _dedupe_vehicles(vehicles: list[dict], iou_threshold: float = 0.55) -> list[dict]:
    ranked = sorted(
        vehicles,
        key=lambda v: float(v.get("confidence", 0)) * float(v["width"]) * float(v["height"]),
        reverse=True,
    )
    kept: list[dict] = []
    for vehicle in ranked:
        vb = vehicle_to_bbox_xyxy(vehicle)
        if any(_bbox_iou(vb, vehicle_to_bbox_xyxy(k)) > iou_threshold for k in kept):
            continue
        kept.append(vehicle)
    return kept


def _filter_vehicle_boxes(vehicles: list[dict]) -> list[dict]:
    filtered: list[dict] = []
    for vehicle in vehicles:
        area = float(vehicle["width"]) * float(vehicle["height"])
        if area < MIN_VEHICLE_AREA or area > MAX_VEHICLE_AREA:
            continue
        if float(vehicle["width"]) < 0.04 or float(vehicle["height"]) < 0.04:
            continue
        filtered.append(vehicle)
    return filtered


def detect_vehicles(
    image_path: str,
    *,
    conf: float | None = None,
    iou: float = 0.45,
    imgsz: int | None = None,
) -> list[dict]:
    """
    Return precise vehicle boxes in normalized YOLO xywh format.
    Uses multi-pass confidence when the first pass finds nothing.
    """
    settings = get_settings()
    base_conf = conf if conf is not None else getattr(settings, "vehicle_detector_conf", 0.25)
    image_size = imgsz or getattr(settings, "vehicle_detector_imgsz", 640)

    thresholds = []
    for value in (base_conf, base_conf * 0.75, 0.15):
        rounded = round(value, 3)
        if rounded not in thresholds:
            thresholds.append(rounded)

    collected: list[dict] = []
    try:
        model = _get_vehicle_model()
        names = model.names or {}
        for threshold in thresholds:
            results = model.predict(
                image_path,
                verbose=False,
                conf=threshold,
                iou=iou,
                imgsz=image_size,
                classes=list(COCO_VEHICLE_CLASS_IDS),
            )
            for result in results:
                if result.boxes is None:
                    continue
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    if cls_id not in COCO_VEHICLE_CLASS_IDS:
                        continue
                    xywhn = box.xywhn[0]
                    collected.append({
                        "x_center": float(xywhn[0]),
                        "y_center": float(xywhn[1]),
                        "width": float(xywhn[2]),
                        "height": float(xywhn[3]),
                        "confidence": float(box.conf[0]),
                        "vehicle_type": names.get(cls_id, "vehicle"),
                    })
            if collected:
                break
    except Exception:
        return []

    return _dedupe_vehicles(_filter_vehicle_boxes(collected), iou_threshold=iou)


def detect_vehicles_from_bytes(
    image_bytes: bytes,
    *,
    conf: float | None = None,
    iou: float = 0.45,
) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as imgf:
        imgf.write(image_bytes)
        path = imgf.name
    try:
        return detect_vehicles(path, conf=conf, iou=iou)
    finally:
        Path(path).unlink(missing_ok=True)


def largest_vehicle(vehicles: list[dict]) -> dict | None:
    if not vehicles:
        return None
    return max(vehicles, key=lambda v: float(v["width"]) * float(v["height"]))


def vehicle_to_bbox_xyxy(vehicle: dict) -> list[float]:
    cx = float(vehicle["x_center"])
    cy = float(vehicle["y_center"])
    w = float(vehicle["width"])
    h = float(vehicle["height"])
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def find_vehicle_for_bbox(query_bbox: list[float], vehicles: list[dict]) -> dict | None:
    if not vehicles:
        return None
    if len(vehicles) == 1:
        return vehicles[0]

    qcx, qcy = _bbox_center(query_bbox)
    best: dict | None = None
    best_score = -1.0
    for vehicle in vehicles:
        vb = vehicle_to_bbox_xyxy(vehicle)
        iou = _bbox_iou(query_bbox, vb)
        inside = vb[0] <= qcx <= vb[2] and vb[1] <= qcy <= vb[3]
        vcx, vcy = _bbox_center(vb)
        dist = ((qcx - vcx) ** 2 + (qcy - vcy) ** 2) ** 0.5
        area = float(vehicle["width"]) * float(vehicle["height"])
        score = iou * 3.0 + (2.0 if inside else 0.0) - dist + area
        if score > best_score:
            best_score = score
            best = vehicle
    return best or largest_vehicle(vehicles)


def apply_vehicle_box(candidate: dict, vehicle: dict) -> None:
    candidate["bbox"] = vehicle_to_bbox_xyxy(vehicle)
    candidate["x_center"] = float(vehicle["x_center"])
    candidate["y_center"] = float(vehicle["y_center"])
    candidate["width"] = float(vehicle["width"])
    candidate["height"] = float(vehicle["height"])
    candidate["vehicle_type"] = vehicle.get("vehicle_type", "vehicle")
    candidate["vehicle_confidence"] = float(vehicle.get("confidence", 0.0))
    model_conf = float(candidate.get("confidence", 0.0))
    candidate["confidence"] = min(0.99, model_conf * 0.65 + float(vehicle["confidence"]) * 0.35)
    candidate["pipeline"] = "vehicle_precise"


def snap_candidates_to_vehicles(
    candidates: list[dict],
    vehicles: list[dict],
    *,
    require_vehicle: bool = False,
) -> list[dict]:
    """
    Replace damage/vehicle candidate boxes with COCO vehicle boxes.
    Drop vehicle-related candidates when no matching vehicle if require_vehicle=True.
    """
    if not candidates:
        return []

    output: list[dict] = []
    for candidate in candidates:
        mode = candidate.get("detection_mode")
        if mode not in ("damage", "vehicle"):
            output.append(candidate)
            continue
        if not vehicles:
            if not require_vehicle:
                output.append(candidate)
            continue
        vehicle = find_vehicle_for_bbox(candidate["bbox"], vehicles)
        if not vehicle:
            if not require_vehicle:
                output.append(candidate)
            continue
        apply_vehicle_box(candidate, vehicle)
        output.append(candidate)
    return output


def format_detected_vehicles(vehicles: list[dict]) -> list[dict]:
    """API/UI overlay for COCO vehicle boxes (always when vehicles are found)."""
    return [
        {
            "bbox": vehicle_to_bbox_xyxy(vehicle),
            "confidence": float(vehicle.get("confidence", 0.0)),
            "vehicle_type": vehicle.get("vehicle_type", "vehicle"),
            "label": "Vehicle",
        }
        for vehicle in vehicles
    ]


def pick_vehicle_display_class(class_names: list[str], allowed_norm: set[str]) -> str | None:
    from app.services.driver.project_classes import normalize_class_name

    priority = ("Vehicle", "Car", "Truck", "Bus", "Motorcycle")
    by_norm = {normalize_class_name(name): name for name in class_names}
    for pref in priority:
        key = normalize_class_name(pref)
        if key in allowed_norm and key in by_norm:
            return by_norm[key]
    for name in class_names:
        if detection_mode(name) in ("vehicle", "damage") and normalize_class_name(name) in allowed_norm:
            return name
    return None


def build_vehicle_detector_predictions(
    vehicles: list[dict],
    *,
    class_name: str = "Vehicle",
) -> list[dict]:
    from app.services.driver.detection import map_class_to_event

    mode = detection_mode(class_name)
    event_type = map_class_to_event(class_name)
    if mode == "damage":
        event_type = None
    predictions: list[dict] = []
    for vehicle in vehicles:
        bbox = vehicle_to_bbox_xyxy(vehicle)
        predictions.append({
            "class": class_name,
            "detection_mode": mode,
            "event_type": event_type.value if event_type else None,
            "confidence": float(vehicle.get("confidence", 0.0)),
            "bbox": bbox,
            "x_center": float(vehicle["x_center"]),
            "y_center": float(vehicle["y_center"]),
            "width": float(vehicle["width"]),
            "height": float(vehicle["height"]),
            "vehicle_type": vehicle.get("vehicle_type", "vehicle"),
            "vehicle_confidence": float(vehicle.get("confidence", 0.0)),
            "pipeline": "vehicle_detector",
            "vehicle_only": True,
        })
    return predictions


def align_damage_detections_to_vehicles(
    image_path: str,
    candidates: list[dict],
    *,
    iou: float = 0.45,
    vehicle_conf: float | None = None,
    vehicles: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """Snap accident/damage/vehicle detections to precise COCO vehicle boxes."""
    has_vehicle_class = any(c.get("detection_mode") in ("damage", "vehicle") for c in candidates)
    if not has_vehicle_class and not vehicles:
        return candidates, vehicles or []

    if vehicles is None:
        vehicles = detect_vehicles(image_path, conf=vehicle_conf, iou=iou)

    snapped = snap_candidates_to_vehicles(candidates, vehicles, require_vehicle=True)
    return snapped, vehicles
