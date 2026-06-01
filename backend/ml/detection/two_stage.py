"""Two-stage pipeline: locate vehicle, then classify with the project model."""

from __future__ import annotations

import tempfile
from pathlib import Path

from ml.detection.vehicle_localizer import detect_vehicles, largest_vehicle


def _xywhn_to_xyxy(b: dict) -> tuple[float, float, float, float]:
    cx, cy, w, h = b["x_center"], b["y_center"], b["width"], b["height"]
    return cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2


def _xyxy_to_xywhn(x1: float, y1: float, x2: float, y2: float) -> dict:
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    return {
        "x_center": x1 + w / 2,
        "y_center": y1 + h / 2,
        "width": w,
        "height": h,
    }


def map_crop_prediction_to_full(pred: dict, vehicle: dict) -> dict:
    """Map a normalized prediction inside a vehicle crop back to full-image normalized coords."""
    vx1, vy1, vx2, vy2 = _xywhn_to_xyxy(vehicle)
    vw, vh = vx2 - vx1, vy2 - vy1
    pcx = float(pred.get("x_center", 0.5))
    pcy = float(pred.get("y_center", 0.5))
    pw = float(pred.get("width", 0.2))
    ph = float(pred.get("height", 0.2))
    full_cx = vx1 + pcx * vw
    full_cy = vy1 + pcy * vh
    return {
        **pred,
        "x_center": full_cx,
        "y_center": full_cy,
        "width": pw * vw,
        "height": ph * vh,
    }


def crop_vehicle_image(image_path: str, vehicle: dict) -> str:
    from PIL import Image

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    x1, y1, x2, y2 = _xywhn_to_xyxy(vehicle)
    left = max(0, int(x1 * w))
    top = max(0, int(y1 * h))
    right = min(w, int(x2 * w))
    bottom = min(h, int(y2 * h))
    if right <= left or bottom <= top:
        raise ValueError("Invalid vehicle crop")
    cropped = img.crop((left, top, right, bottom))
    out = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cropped.save(out.name, format="JPEG", quality=92)
    return out.name


def classify_vehicles_two_stage(
    image_path: str,
    weights_path: str,
    adapter,
    *,
    yolo_conf: float = 0.2,
    iou: float = 0.45,
    vehicle_conf: float = 0.35,
) -> tuple[list[dict], list[dict]]:
    """
    Stage 1: COCO vehicle boxes.
    Stage 2: Project model on each vehicle crop.
    Returns (class_predictions_with_vehicle_bbox, vehicle_boxes).
    """
    vehicles = detect_vehicles(image_path, conf=vehicle_conf, iou=iou)
    if not vehicles:
        return [], []

    predictions: list[dict] = []
    for vehicle in vehicles:
        crop_path = None
        try:
            crop_path = crop_vehicle_image(image_path, vehicle)
            raw = adapter.predict(weights_path, crop_path, conf=yolo_conf, iou=iou)
            if not raw:
                continue
            best = max(raw, key=lambda p: p.get("confidence", 0))
            mapped = map_crop_prediction_to_full(best, vehicle)
            vx1, vy1, vx2, vy2 = _xywhn_to_xyxy(vehicle)
            mapped["vehicle_bbox"] = [vx1, vy1, vx2, vy2]
            mapped["vehicle_type"] = vehicle.get("vehicle_type", "vehicle")
            mapped["vehicle_confidence"] = vehicle.get("confidence", 0.0)
            mapped["pipeline"] = "two_stage"
            predictions.append(mapped)
        except Exception:
            continue
        finally:
            if crop_path:
                Path(crop_path).unlink(missing_ok=True)

    return predictions, vehicles
