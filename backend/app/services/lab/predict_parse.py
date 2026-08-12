"""Parse Ultralytics cloud predict payloads into driver detection dicts."""

from __future__ import annotations

from app.services.driver.detection import map_class_to_event


def normalize_lab_detections(payload: dict | list) -> list[dict]:
    items: list = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        images = payload.get("images")
        if isinstance(images, list):
            for image in images:
                if isinstance(image, dict) and isinstance(image.get("results"), list):
                    items.extend(image["results"])
        if not items:
            for key in ("predictions", "detections", "results", "objects", "boxes"):
                val = payload.get(key)
                if isinstance(val, list):
                    items = val
                    break
        if not items and isinstance(payload.get("data"), dict):
            nested = payload["data"]
            for key in ("predictions", "detections", "results"):
                val = nested.get(key)
                if isinstance(val, list):
                    items = val
                    break

    out: list[dict] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        cls = (
            item.get("name")
            or item.get("class_name")
            or item.get("class")
            or item.get("label")
            or "unknown"
        )
        if isinstance(cls, (int, float)):
            cls = str(int(cls))
        conf = item.get("confidence", item.get("conf", item.get("score", 0)))
        bbox = item.get("bbox") or item.get("box") or item.get("xyxy")
        if isinstance(bbox, dict):
            if all(k in bbox for k in ("x1", "y1", "x2", "y2")):
                bbox = [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]]
            elif all(k in bbox for k in ("x", "y", "width", "height")):
                x, y, w, h = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
                bbox = [x, y, x + w, y + h]
        if bbox is None and all(k in item for k in ("x1", "y1", "x2", "y2")):
            bbox = [item["x1"], item["y1"], item["x2"], item["y2"]]
        if bbox is None and all(k in item for k in ("x", "y", "width", "height")):
            x, y, w, h = item["x"], item["y"], item["width"], item["height"]
            bbox = [x, y, x + w, y + h]
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            continue
        try:
            nums = [float(b) for b in bbox]
            confidence = float(conf)
        except (TypeError, ValueError):
            continue
        mapped = map_class_to_event(str(cls))
        out.append({
            "class": str(cls),
            "confidence": round(confidence, 4),
            "bbox": nums,
            "event_type": mapped.value if mapped else None,
        })
    return out
