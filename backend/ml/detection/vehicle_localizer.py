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
