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


def predict_cached(
    weights_key: str,
    weights_bytes: bytes,
    image_source: str | bytes,
    *,
    architecture: str = "yolo11",
    conf: float = 0.25,
    iou: float = 0.45,
    imgsz: int | None = None,
) -> list[dict]:
    """Single forward pass using cached weights (path or JPEG bytes)."""
    settings = get_settings()
    size = imgsz or settings.inference_imgsz
    half = settings.inference_use_half and settings.inference_device != "cpu"

    if isinstance(image_source, bytes):
        source: str | np.ndarray = _decode_image(image_source)
    else:
        source = image_source

    model = get_cached_yolo(weights_key, weights_bytes, architecture=architecture)
    results = model.predict(
        source,
        verbose=False,
        conf=conf,
        iou=iou,
        imgsz=size,
        half=half,
        max_det=50,
    )
    predictions: list[dict] = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            predictions.append({
                "class_id": int(box.cls[0]),
                "confidence": float(box.conf[0]),
                "x_center": float(box.xywhn[0][0]),
                "y_center": float(box.xywhn[0][1]),
                "width": float(box.xywhn[0][2]),
                "height": float(box.xywhn[0][3]),
            })
    return predictions


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
