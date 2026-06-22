"""ONNX inference for imported models without PyTorch weights."""

from __future__ import annotations

import tempfile
import time
from pathlib import Path

import cv2
import numpy as np

from app.services.driver.project_classes import normalize_class_name


def _class_score(raw: float) -> float:
    if 0.0 <= raw <= 1.0:
        return raw
    if raw > 1.0:
        return float(1.0 / (1.0 + np.exp(-raw)))
    return raw


def _nms(boxes: list[dict], iou_thresh: float = 0.45) -> list[dict]:
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    kept: list[dict] = []
    for box in boxes:
        if any(_iou(box, k) > iou_thresh for k in kept):
            continue
        kept.append(box)
    return kept


def _iou(a: dict, b: dict) -> float:
    ix1 = max(a["x1"], b["x1"])
    iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"])
    iy2 = min(a["y2"], b["y2"])
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    union = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"]) + (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]) - inter
    return inter / union if union > 0 else 0.0


def _prepare_input(
    image_bytes: bytes,
    imgsz: int,
    *,
    stretch: bool,
) -> tuple[np.ndarray, int, int]:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    orig_h, orig_w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if stretch:
        resized = cv2.resize(rgb, (imgsz, imgsz), interpolation=cv2.INTER_LINEAR)
    else:
        gain = min(imgsz / orig_h, imgsz / orig_w)
        new_w = int(round(orig_w * gain))
        new_h = int(round(orig_h * gain))
        resized = cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
        pad_top = (imgsz - new_h) // 2
        pad_left = (imgsz - new_w) // 2
        canvas[pad_top : pad_top + new_h, pad_left : pad_left + new_w] = resized
        resized = canvas
    tensor = resized.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, orig_w, orig_h


def _decode_yolo_output(
    output: np.ndarray,
    class_names: list[str],
    *,
    min_confidence: float,
    orig_w: int,
    orig_h: int,
    imgsz: int,
    stretch: bool,
) -> list[dict]:
    data = np.asarray(output, dtype=np.float32)
    if data.ndim == 3:
        data = data[0]
    if data.ndim != 2:
        return []

    if data.shape[0] < data.shape[1]:
        data = data.T

    num_rows, num_ch = data.shape
    nc = len(class_names)
    tensor_nc = num_ch - 4
    if tensor_nc < 1 or num_rows < 100:
        return []

    use_nc = min(nc, tensor_nc)
    candidates: list[dict] = []

    for i in range(num_rows):
        cx, cy, w, h = data[i, 0:4]
        scores = data[i, 4 : 4 + use_nc]
        best_idx = int(np.argmax(scores))
        best_score = _class_score(float(scores[best_idx]))
        if best_score < min_confidence:
            continue

        if stretch:
            x1 = max(0.0, min(1.0, (cx - w / 2) / imgsz))
            y1 = max(0.0, min(1.0, (cy - h / 2) / imgsz))
            x2 = max(0.0, min(1.0, (cx + w / 2) / imgsz))
            y2 = max(0.0, min(1.0, (cy + h / 2) / imgsz))
        else:
            gain = min(imgsz / orig_h, imgsz / orig_w)
            pad_left = (imgsz - int(round(orig_w * gain))) // 2
            pad_top = (imgsz - int(round(orig_h * gain))) // 2
            cx -= pad_left
            cy -= pad_top
            left = (cx - w / 2) / gain
            top = (cy - h / 2) / gain
            width = w / gain
            height = h / gain
            x1 = max(0.0, min(1.0, left / orig_w))
            y1 = max(0.0, min(1.0, top / orig_h))
            x2 = max(0.0, min(1.0, (left + width) / orig_w))
            y2 = max(0.0, min(1.0, (top + height) / orig_h))

        if x2 <= x1 or y2 <= y1:
            continue
        candidates.append(
            {
                "class_name": class_names[best_idx],
                "confidence": best_score,
                "bbox": [x1, y1, x2, y2],
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            }
        )

    kept = _nms(candidates)[:50]
    for box in kept:
        box.pop("x1", None)
        box.pop("y1", None)
        box.pop("x2", None)
        box.pop("y2", None)
    return kept


def run_onnx_detection_sync(
    onnx_bytes: bytes,
    image_bytes: bytes,
    class_names: list[str],
    allowed_norm: set[str],
    *,
    min_confidence: float | None = None,
    inference_imgsz: int | None = None,
    resize_mode: str = "stretch",
) -> tuple[list[dict], str | None, dict]:
    import onnxruntime as ort

    t0 = time.perf_counter()
    conf = min_confidence if min_confidence is not None else 0.25
    imgsz = inference_imgsz or 640
    stretch = resize_mode.lower() == "stretch"

    with tempfile.TemporaryDirectory() as tmp:
        onnx_path = str(Path(tmp) / "model.onnx")
        Path(onnx_path).write_bytes(onnx_bytes)
        session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    tensor, orig_w, orig_h = _prepare_input(image_bytes, imgsz, stretch=stretch)
    outputs = session.run([output_name], {input_name: tensor})
    raw_boxes = _decode_yolo_output(
        outputs[0],
        class_names,
        min_confidence=conf,
        orig_w=orig_w,
        orig_h=orig_h,
        imgsz=imgsz,
        stretch=stretch,
    )

    detections: list[dict] = []
    all_candidates = list(raw_boxes)
    for candidate in raw_boxes:
        norm = normalize_class_name(candidate["class_name"])
        if norm not in allowed_norm:
            continue
        detections.append(candidate)

    latency_ms = int((time.perf_counter() - t0) * 1000)
    meta = {
        "latency_ms": latency_ms,
        "inference_backend": "onnxruntime",
        "inference_imgsz": imgsz,
        "resize_mode": "stretch" if stretch else "letterbox",
        "all_candidates": all_candidates,
    }
    return detections, None, meta
