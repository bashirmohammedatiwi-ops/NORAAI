"""In-process YOLO model cache for low-latency fleet / camera inference."""

from __future__ import annotations

import hashlib
import tempfile
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import get_settings

_lock = threading.Lock()
_entries: OrderedDict[str, "_CacheEntry"] = OrderedDict()


@dataclass
class _CacheEntry:
    model: Any
    weights_path: str
    weights_key: str
    architecture: str


def _cache_key(weights_key: str, weights_bytes: bytes) -> str:
    return f"{weights_key}:{len(weights_bytes)}"


def _decode_image(image_bytes: bytes) -> np.ndarray:
    import cv2

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image bytes")
    return img


def _evict_if_needed(max_size: int) -> None:
    while len(_entries) > max_size:
        _, entry = _entries.popitem(last=False)
        try:
            Path(entry.weights_path).unlink(missing_ok=True)
        except OSError:
            pass


def get_cached_yolo(
    weights_key: str,
    weights_bytes: bytes,
    *,
    architecture: str = "yolo11",
) -> Any:
    """Return a warm Ultralytics YOLO instance; downloads are caller's responsibility."""
    if not weights_bytes or weights_bytes == b"mock_weights":
        raise ValueError("Invalid model weights")

    key = _cache_key(weights_key, weights_bytes)
    settings = get_settings()
    max_size = max(1, settings.inference_model_cache_size)

    with _lock:
        if key in _entries:
            _entries.move_to_end(key)
            return _entries[key].model

    weights_dir = Path(tempfile.gettempdir()) / "aiops_model_cache"
    weights_dir.mkdir(parents=True, exist_ok=True)
    safe_name = hashlib.sha256(key.encode()).hexdigest()[:24]
    weights_path = str(weights_dir / f"{safe_name}.pt")
    if not Path(weights_path).exists():
        Path(weights_path).write_bytes(weights_bytes)

    from ultralytics import YOLO

    model = YOLO(weights_path)
    device = settings.inference_device
    if device and device != "cpu":
        try:
            model.to(device)
        except Exception:
            pass

    with _lock:
        if key in _entries:
            return _entries[key].model
        _evict_if_needed(max_size)
        _entries[key] = _CacheEntry(
            model=model,
            weights_path=weights_path,
            weights_key=weights_key,
            architecture=architecture,
        )
        return model


def _boxes_to_predictions(results, model_names: list[str]) -> list[dict]:
    predictions: list[dict] = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            cls_id = int(box.cls[0])
            class_name = model_names[cls_id] if cls_id < len(model_names) else None
            predictions.append({
                "class_id": cls_id,
                "class_name": class_name,
                "confidence": float(box.conf[0]),
                "x_center": float(box.xywhn[0][0]),
                "y_center": float(box.xywhn[0][1]),
                "width": float(box.xywhn[0][2]),
                "height": float(box.xywhn[0][3]),
            })
    return predictions


def _nms_merge_predictions(candidates: list[dict], iou_threshold: float = 0.5) -> list[dict]:
    """Greedy NMS on normalized xywh candidates (multi-scale merge)."""
    if not candidates:
        return []
    sorted_cands = sorted(candidates, key=lambda p: float(p.get("confidence", 0)), reverse=True)
    kept: list[dict] = []

    def iou(a: dict, b: dict) -> float:
        ax1 = float(a["x_center"]) - float(a["width"]) / 2
        ay1 = float(a["y_center"]) - float(a["height"]) / 2
        ax2 = float(a["x_center"]) + float(a["width"]) / 2
        ay2 = float(a["y_center"]) + float(a["height"]) / 2
        bx1 = float(b["x_center"]) - float(b["width"]) / 2
        by1 = float(b["y_center"]) - float(b["height"]) / 2
        bx2 = float(b["x_center"]) + float(b["width"]) / 2
        by2 = float(b["y_center"]) + float(b["height"]) / 2
        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)
        inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
        if inter <= 0:
            return 0.0
        area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
        area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    for cand in sorted_cands:
        if any(
            int(cand.get("class_id", -1)) == int(k.get("class_id", -2))
            and iou(cand, k) >= iou_threshold
            for k in kept
        ):
            continue
        kept.append(cand)
    return kept


def predict_cached(
    weights_key: str,
    weights_bytes: bytes,
    image_source: str | bytes,
    *,
    architecture: str = "yolo11",
    conf: float = 0.25,
    iou: float = 0.45,
    imgsz: int | None = None,
    high_accuracy: bool = False,
) -> list[dict]:
    """Forward pass using cached weights; optional TTA + multi-scale for manual test."""
    settings = get_settings()
    size = imgsz or settings.inference_imgsz
    half = settings.inference_use_half and settings.inference_device != "cpu"
    use_conf = conf
    if high_accuracy:
        use_conf = min(conf, settings.inference_manual_test_conf)

    if isinstance(image_source, bytes):
        source: str | np.ndarray = _decode_image(image_source)
    else:
        source = image_source

    model = get_cached_yolo(weights_key, weights_bytes, architecture=architecture)
    from app.services.inference.class_names import names_from_yolo_model

    model_names = names_from_yolo_model(model)

    if not high_accuracy:
        results = model.predict(
            source,
            verbose=False,
            conf=use_conf,
            iou=iou,
            imgsz=size,
            half=half,
            max_det=50,
        )
        return _boxes_to_predictions(results, model_names)

    sizes = sorted({size, max(320, int(size * 0.85))})
    merged: list[dict] = []
    for sz in sizes:
        results = model.predict(
            source,
            verbose=False,
            conf=use_conf,
            iou=iou,
            imgsz=sz,
            half=half,
            max_det=80,
            augment=settings.inference_manual_test_augment,
        )
        merged.extend(_boxes_to_predictions(results, model_names))
    return _nms_merge_predictions(merged, iou_threshold=iou)


def invalidate_weights(weights_key: str) -> None:
    from app.services.inference.weights_store import invalidate_weights_bytes

    invalidate_weights_bytes(weights_key)
    with _lock:
        doomed = [k for k, e in _entries.items() if e.weights_key == weights_key]
        for k in doomed:
            entry = _entries.pop(k, None)
            if entry:
                Path(entry.weights_path).unlink(missing_ok=True)


def cache_stats() -> dict:
    with _lock:
        return {"cached_models": len(_entries), "keys": list(_entries.keys())}
