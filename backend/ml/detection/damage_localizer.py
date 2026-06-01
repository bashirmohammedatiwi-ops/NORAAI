"""Locate damaged regions on a vehicle using texture/edge analysis (no extra model)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np


def _bbox_xyxy(bbox: list[float]) -> tuple[float, float, float, float]:
    return float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])


def _xyxy_to_xywhn(x1: float, y1: float, x2: float, y2: float) -> dict:
    w = max(0.001, x2 - x1)
    h = max(0.001, y2 - y1)
    return {
        "x_center": x1 + w / 2,
        "y_center": y1 + h / 2,
        "width": w,
        "height": h,
    }


def bbox_is_full_frame(bbox: list[float], threshold: float = 0.62) -> bool:
    x1, y1, x2, y2 = _bbox_xyxy(bbox)
    return (x2 - x1) >= threshold or (y2 - y1) >= threshold


def localize_damage_region(
    image_path: str,
    *,
    vehicle_bbox: list[float] | None = None,
    hint_bbox: list[float] | None = None,
) -> dict:
    """
    Find a tight box on visible damage (cracks, dents, missing parts).
    Returns normalized YOLO xywh + xyxy bbox list.
    """
    img = cv2.imread(image_path)
    if img is None:
        return _fallback_region(hint_bbox, vehicle_bbox)

    h, w = img.shape[:2]
    if vehicle_bbox:
        vx1, vy1, vx2, vy2 = _bbox_xyxy(vehicle_bbox)
        x1 = max(0, int(vx1 * w))
        y1 = max(0, int(vy1 * h))
        x2 = min(w, int(vx2 * w))
        y2 = min(h, int(vy2 * h))
    else:
        x1, y1, x2, y2 = 0, 0, w, h

    if hint_bbox and not bbox_is_full_frame(hint_bbox):
        hx1, hy1, hx2, hy2 = _bbox_xyxy(hint_bbox)
        pad_x = (hx2 - hx1) * 0.35
        pad_y = (hy2 - hy1) * 0.35
        sx1 = max(x1, int((hx1 - pad_x) * w))
        sy1 = max(y1, int((hy1 - pad_y) * h))
        sx2 = min(x2, int((hx2 + pad_x) * w))
        sy2 = min(y2, int((hy2 + pad_y) * h))
        if sx2 - sx1 > 24 and sy2 - sy1 > 24:
            x1, y1, x2, y2 = sx1, sy1, sx2, sy2

    crop = img[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
        return _fallback_region(hint_bbox, vehicle_bbox)

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    lap = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
    blur = cv2.GaussianBlur(gray, (11, 11), 0)
    texture = cv2.absdiff(gray, blur).astype(np.float64)
    score_map = 0.55 * lap + 0.45 * texture

    ch, cw = score_map.shape
    best_score = -1.0
    best_box: tuple[int, int, int, int] | None = None

    for win_w_frac, win_h_frac in ((0.32, 0.28), (0.42, 0.36), (0.52, 0.44), (0.38, 0.48)):
        win_w = max(20, int(cw * win_w_frac))
        win_h = max(20, int(ch * win_h_frac))
        step_x = max(6, win_w // 5)
        step_y = max(6, win_h // 5)
        for yy in range(0, max(1, ch - win_h + 1), step_y):
            for xx in range(0, max(1, cw - win_w + 1), step_x):
                patch = score_map[yy : yy + win_h, xx : xx + win_w]
                score = float(np.mean(patch))
                if score > best_score:
                    best_score = score
                    best_box = (xx, yy, win_w, win_h)

    if best_box is None:
        return _fallback_region(hint_bbox, vehicle_bbox)

    bx, by, bw, bh = best_box
    fx1 = (x1 + bx) / w
    fy1 = (y1 + by) / h
    fx2 = (x1 + bx + bw) / w
    fy2 = (y1 + by + bh) / h
    fx1, fy1 = max(0.0, fx1), max(0.0, fy1)
    fx2, fy2 = min(1.0, fx2), min(1.0, fy2)

    region = _xyxy_to_xywhn(fx1, fy1, fx2, fy2)
    region["bbox"] = [fx1, fy1, fx2, fy2]
    region["confidence"] = min(0.92, 0.55 + best_score / 120.0)
    return region


def localize_damage_from_bytes(
    image_bytes: bytes,
    *,
    vehicle_bbox: list[float] | None = None,
    hint_bbox: list[float] | None = None,
) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as imgf:
        imgf.write(image_bytes)
        path = imgf.name
    try:
        return localize_damage_region(path, vehicle_bbox=vehicle_bbox, hint_bbox=hint_bbox)
    finally:
        Path(path).unlink(missing_ok=True)


def _fallback_region(
    hint_bbox: list[float] | None,
    vehicle_bbox: list[float] | None,
) -> dict:
    if hint_bbox and not bbox_is_full_frame(hint_bbox):
        x1, y1, x2, y2 = _bbox_xyxy(hint_bbox)
        region = _xyxy_to_xywhn(x1, y1, x2, y2)
        region["bbox"] = [x1, y1, x2, y2]
        region["confidence"] = 0.75
        return region

    if vehicle_bbox:
        vx1, vy1, vx2, vy2 = _bbox_xyxy(vehicle_bbox)
        vw, vh = vx2 - vx1, vy2 - vy1
        cx = vx1 + vw / 2
        cy = vy1 + vh * 0.46
        region = {
            "x_center": cx,
            "y_center": cy,
            "width": vw * 0.42,
            "height": vh * 0.38,
            "confidence": 0.72,
        }
        region["bbox"] = [
            cx - region["width"] / 2,
            cy - region["height"] / 2,
            cx + region["width"] / 2,
            cy + region["height"] / 2,
        ]
        return region

    region = _xyxy_to_xywhn(0.22, 0.28, 0.78, 0.72)
    region["bbox"] = [0.22, 0.28, 0.78, 0.72]
    region["confidence"] = 0.7
    return region
