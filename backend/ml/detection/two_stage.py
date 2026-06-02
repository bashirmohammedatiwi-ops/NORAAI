"""Two-stage pipeline: locate vehicle, then classify with the project model."""

from __future__ import annotations

import tempfile
from pathlib import Path

from ml.detection.vehicle_localizer import (
    apply_vehicle_box,
    detect_vehicles,
    vehicle_to_bbox_xyxy,
)


def _xywhn_to_xyxy(b: dict) -> tuple[float, float, float, float]:
    cx, cy, w, h = b["x_center"], b["y_center"], b["width"], b["height"]
    return cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2


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
    vehicle_conf: float | None = None,
    vehicles: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Stage 1: precise COCO vehicle boxes.
    Stage 2: project model on each vehicle crop — output uses the COCO vehicle box.
    """
    from app.core.config import get_settings

    settings = get_settings()
    max_vehicles = max(1, settings.inference_max_two_stage_vehicles)

    if vehicles is None:
        vehicles = detect_vehicles(image_path, conf=vehicle_conf, iou=iou)
    if not vehicles:
        return [], []

    vehicles = sorted(
        vehicles,
        key=lambda v: float(v.get("confidence", 0)) * float(v["width"]) * float(v["height"]),
        reverse=True,
    )[:max_vehicles]

    predictions: list[dict] = []
    for vehicle in vehicles:
        crop_path = None
        try:
            crop_path = crop_vehicle_image(image_path, vehicle)
            raw = adapter.predict(weights_path, crop_path, conf=yolo_conf, iou=iou)
            if not raw:
                continue
            best = max(raw, key=lambda p: p.get("confidence", 0))
            prediction = dict(best)
            apply_vehicle_box(prediction, vehicle)
            prediction["vehicle_bbox"] = vehicle_to_bbox_xyxy(vehicle)
            prediction["pipeline"] = "two_stage_vehicle"
            predictions.append(prediction)
        except Exception:
            continue
        finally:
            if crop_path:
                Path(crop_path).unlink(missing_ok=True)

    return predictions, vehicles
