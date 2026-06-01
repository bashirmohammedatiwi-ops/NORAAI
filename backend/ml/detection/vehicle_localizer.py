"""Detect cars/trucks on an image using COCO-pretrained YOLO."""

from __future__ import annotations

import tempfile
from pathlib import Path

# COCO indices in Ultralytics YOLO
COCO_VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck

_vehicle_model = None


def _get_vehicle_model():
    global _vehicle_model
    if _vehicle_model is None:
        from ultralytics import YOLO
        _vehicle_model = YOLO("yolo11n.pt")
    return _vehicle_model


def detect_vehicles(
    image_path: str,
    *,
    conf: float = 0.35,
    iou: float = 0.45,
) -> list[dict]:
    """
    Return vehicle boxes in normalized YOLO xywh format:
    { x_center, y_center, width, height, confidence, vehicle_type }
    """
    try:
        model = _get_vehicle_model()
        results = model.predict(image_path, verbose=False, conf=conf, iou=iou, classes=list(COCO_VEHICLE_CLASS_IDS))
        vehicles: list[dict] = []
        names = model.names or {}
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in COCO_VEHICLE_CLASS_IDS:
                    continue
                xywhn = box.xywhn[0]
                vehicles.append({
                    "x_center": float(xywhn[0]),
                    "y_center": float(xywhn[1]),
                    "width": float(xywhn[2]),
                    "height": float(xywhn[3]),
                    "confidence": float(box.conf[0]),
                    "vehicle_type": names.get(cls_id, "vehicle"),
                })
        return vehicles
    except Exception:
        return []


def detect_vehicles_from_bytes(image_bytes: bytes, *, conf: float = 0.35) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as imgf:
        imgf.write(image_bytes)
        path = imgf.name
    try:
        return detect_vehicles(path, conf=conf)
    finally:
        Path(path).unlink(missing_ok=True)


def largest_vehicle(vehicles: list[dict]) -> dict | None:
    if not vehicles:
        return None
    return max(vehicles, key=lambda v: v["width"] * v["height"])


def vehicle_to_bbox_xyxy(vehicle: dict) -> list[float]:
    cx = float(vehicle["x_center"])
    cy = float(vehicle["y_center"])
    w = float(vehicle["width"])
    h = float(vehicle["height"])
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def find_vehicle_for_bbox(damage_bbox: list[float], vehicles: list[dict]) -> dict | None:
    if not vehicles:
        return None
    if len(vehicles) == 1:
        return vehicles[0]

    dcx, dcy = _bbox_center(damage_bbox)
    best: dict | None = None
    best_score = -1.0
    for vehicle in vehicles:
        vb = vehicle_to_bbox_xyxy(vehicle)
        inside = vb[0] <= dcx <= vb[2] and vb[1] <= dcy <= vb[3]
        vcx, vcy = _bbox_center(vb)
        dist = ((dcx - vcx) ** 2 + (dcy - vcy) ** 2) ** 0.5
        area = float(vehicle["width"]) * float(vehicle["height"])
        score = (2.0 if inside else 0.0) - dist + area
        if score > best_score:
            best_score = score
            best = vehicle
    return best or largest_vehicle(vehicles)


def align_damage_detections_to_vehicles(
    image_path: str,
    candidates: list[dict],
    *,
    iou: float = 0.45,
    vehicle_conf: float = 0.3,
) -> tuple[list[dict], list[dict]]:
    """Snap accident/damage detections to full vehicle boxes (no sub-region damage boxes)."""
    has_damage = any(c.get("detection_mode") == "damage" for c in candidates)
    if not has_damage:
        return candidates, []

    vehicles = detect_vehicles(image_path, conf=vehicle_conf, iou=iou)
    for candidate in candidates:
        if candidate.get("detection_mode") != "damage":
            continue
        vehicle = find_vehicle_for_bbox(candidate["bbox"], vehicles) or largest_vehicle(vehicles)
        if vehicle:
            candidate["bbox"] = vehicle_to_bbox_xyxy(vehicle)
            candidate["vehicle_type"] = vehicle.get("vehicle_type", "vehicle")
            candidate["vehicle_confidence"] = float(vehicle.get("confidence", 0.0))
        candidate.pop("vehicle_bbox", None)
        candidate["pipeline"] = candidate.get("pipeline", "vehicle_only")

    return candidates, vehicles
