import json
from typing import Any

import cv2
import numpy as np
from PIL import Image as PILImage


def assess_image_quality(image_bytes: bytes) -> dict[str, Any]:
    """Compute composite quality score 0-100 for an image."""
    result: dict[str, Any] = {
        "overall_score": 0.0,
        "blur_score": 0.0,
        "brightness_score": 0.0,
        "resolution_score": 0.0,
        "is_corrupted": False,
        "details": {},
    }

    try:
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            result["is_corrupted"] = True
            result["overall_score"] = 0.0
            return result

        height, width = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Blur detection via Laplacian variance
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur_score = min(100.0, laplacian_var / 5.0)
        result["blur_score"] = round(blur_score, 2)

        # Brightness
        mean_luminance = float(np.mean(gray))
        if mean_luminance < 30:
            brightness_score = mean_luminance / 30.0 * 50.0
        elif mean_luminance > 220:
            brightness_score = max(0, 100 - (mean_luminance - 220) * 2)
        else:
            brightness_score = 100.0
        result["brightness_score"] = round(brightness_score, 2)

        # Resolution score
        pixels = width * height
        if pixels >= 1920 * 1080:
            resolution_score = 100.0
        elif pixels >= 1280 * 720:
            resolution_score = 80.0
        elif pixels >= 640 * 480:
            resolution_score = 60.0
        else:
            resolution_score = max(20.0, pixels / (640 * 480) * 60.0)
        result["resolution_score"] = round(resolution_score, 2)

        overall = blur_score * 0.4 + brightness_score * 0.3 + resolution_score * 0.3
        result["overall_score"] = round(min(100.0, max(0.0, overall)), 2)
        result["details"] = {
            "width": width,
            "height": height,
            "laplacian_variance": round(laplacian_var, 2),
            "mean_luminance": round(mean_luminance, 2),
        }
    except Exception as exc:
        result["is_corrupted"] = True
        result["details"]["error"] = str(exc)
        result["overall_score"] = 0.0

    return result


def extract_gps_from_exif(image_bytes: bytes) -> tuple[float | None, float | None]:
    try:
        from io import BytesIO

        img = PILImage.open(BytesIO(image_bytes))
        exif = img._getexif()
        if not exif:
            return None, None
        # Simplified EXIF GPS extraction placeholder
        return None, None
    except Exception:
        return None, None
