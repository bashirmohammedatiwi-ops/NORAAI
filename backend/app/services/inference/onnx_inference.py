"""ONNX inference for imported models without PyTorch weights."""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.services.driver.project_classes import normalize_class_name


def run_onnx_detection_sync(
    onnx_bytes: bytes,
    image_bytes: bytes,
    class_names: list[str],
    allowed_norm: set[str],
    *,
    min_confidence: float | None = None,
    inference_imgsz: int | None = None,
) -> tuple[list[dict], str | None, dict]:
    import time

    from ultralytics import YOLO

    t0 = time.perf_counter()
    conf = min_confidence if min_confidence is not None else 0.25
    imgsz = inference_imgsz or 640

    with tempfile.TemporaryDirectory() as tmp:
        onnx_path = str(Path(tmp) / "model.onnx")
        Path(onnx_path).write_bytes(onnx_bytes)
        model = YOLO(onnx_path)
        results = model.predict(
            source=image_bytes,
            conf=conf,
            iou=0.45,
            imgsz=imgsz,
            verbose=False,
        )

    detections: list[dict] = []
    all_candidates: list[dict] = []
    names = class_names or list(getattr(model, "names", {}).values())

    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        xyxy = boxes.xyxy.cpu().tolist()
        confs = boxes.conf.cpu().tolist()
        cls_ids = boxes.cls.cpu().tolist()
        h, w = result.orig_shape[:2]
        for box, score, cls_id in zip(xyxy, confs, cls_ids):
            idx = int(cls_id)
            raw_name = names[idx] if idx < len(names) else str(idx)
            norm = normalize_class_name(raw_name)
            x1, y1, x2, y2 = box
            candidate = {
                "class_name": raw_name,
                "confidence": float(score),
                "bbox": [x1 / w, y1 / h, x2 / w, y2 / h],
            }
            all_candidates.append(candidate)
            if norm not in allowed_norm:
                continue
            detections.append(candidate)

    latency_ms = int((time.perf_counter() - t0) * 1000)
    meta = {
        "latency_ms": latency_ms,
        "inference_backend": "onnx",
        "inference_imgsz": imgsz,
        "all_candidates": all_candidates,
    }
    return detections, None, meta
