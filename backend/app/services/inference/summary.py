"""Structured yes/no summary: vehicles + accident, road defects."""

from __future__ import annotations

from ml.detection.class_taxonomy import detection_mode, is_damage_class, is_road_class


def _max_confidence(items: list[dict]) -> float | None:
    if not items:
        return None
    return max(float(p.get("confidence") or 0) for p in items)


def _is_confirmed_accident(pred: dict) -> bool:
    if pred.get("pipeline") == "vehicle_detector" and pred.get("vehicle_only"):
        return False
    if not is_damage_class(pred.get("class", "")):
        return False
    return pred.get("event_type") == "accident" or detection_mode(pred.get("class", "")) == "damage"


def build_detection_summary(
    predictions: list[dict],
    *,
    detected_vehicles: list[dict] | None = None,
    vehicle_count: int = 0,
) -> dict:
    """
    Dual-domain result for UI and driver integrations:
    - vehicles: found + accident yes/no
    - road: defects yes/no + list
    """
    detected_vehicles = detected_vehicles or []
    vehicle_count = vehicle_count or len(detected_vehicles)

    accident_preds = [p for p in predictions if _is_confirmed_accident(p)]
    road_preds = [p for p in predictions if is_road_class(p.get("class", ""))]
    vehicle_label_preds = [
        p for p in predictions
        if detection_mode(p.get("class", "")) == "vehicle"
        or (p.get("pipeline") == "vehicle_detector" and p.get("vehicle_only"))
    ]

    vehicle_boxes = []
    for v in detected_vehicles:
        vehicle_boxes.append({
            "bbox": v.get("bbox"),
            "confidence": v.get("confidence"),
            "vehicle_type": v.get("vehicle_type", "vehicle"),
            "label": v.get("label", "Vehicle"),
        })
    if not vehicle_boxes:
        for p in vehicle_label_preds + accident_preds:
            vehicle_boxes.append({
                "bbox": p.get("bbox"),
                "confidence": p.get("confidence"),
                "vehicle_type": p.get("vehicle_type", "vehicle"),
                "label": p.get("class", "Vehicle"),
            })

    accident_detected = len(accident_preds) > 0
    road_issues_detected = len(road_preds) > 0

    return {
        "vehicles": {
            "found": vehicle_count > 0 or len(vehicle_boxes) > 0,
            "count": max(vehicle_count, len(vehicle_boxes)),
            "accident": {
                "detected": accident_detected,
                "confidence": _max_confidence(accident_preds),
                "class": accident_preds[0]["class"] if accident_preds else None,
            },
            "boxes": vehicle_boxes,
        },
        "road": {
            "issues_detected": road_issues_detected,
            "issue_count": len(road_preds),
            "confidence": _max_confidence(road_preds),
            "issues": [
                {
                    "type": p.get("class"),
                    "confidence": float(p.get("confidence") or 0),
                    "bbox": p.get("bbox"),
                    "event_type": p.get("event_type"),
                }
                for p in road_preds
            ],
        },
    }
