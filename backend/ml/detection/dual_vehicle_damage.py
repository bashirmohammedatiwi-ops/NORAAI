"""Pair vehicle localization with damage-region refinement."""

from __future__ import annotations

from ml.detection.class_taxonomy import detection_mode
from ml.detection.damage_localizer import bbox_is_full_frame, localize_damage_region
from ml.detection.vehicle_localizer import detect_vehicles, largest_vehicle


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def vehicle_to_bbox_xyxy(vehicle: dict) -> list[float]:
    cx = float(vehicle["x_center"])
    cy = float(vehicle["y_center"])
    w = float(vehicle["width"])
    h = float(vehicle["height"])
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


def find_vehicle_for_damage(damage_bbox: list[float], vehicles: list[dict]) -> dict | None:
    if not vehicles:
        return None
    if len(vehicles) == 1:
        return vehicles[0]

    best: dict | None = None
    best_score = -1.0
    dcx, dcy = _bbox_center(damage_bbox)
    for vehicle in vehicles:
        vb = vehicle_to_bbox_xyxy(vehicle)
        iou = _bbox_iou(damage_bbox, vb)
        vcx, vcy = _bbox_center(vb)
        inside = vb[0] <= dcx <= vb[2] and vb[1] <= dcy <= vb[3]
        dist = ((dcx - vcx) ** 2 + (dcy - vcy) ** 2) ** 0.5
        score = iou * 2.0 + (1.0 if inside else 0.0) - dist
        if score > best_score:
            best_score = score
            best = vehicle
    return best or largest_vehicle(vehicles)


def attach_vehicle_to_damage_candidate(candidate: dict, vehicles: list[dict]) -> None:
    if candidate.get("vehicle_bbox") or not vehicles:
        return
    vehicle = find_vehicle_for_damage(candidate["bbox"], vehicles)
    if not vehicle:
        vehicle = largest_vehicle(vehicles)
    if not vehicle:
        return
    candidate["vehicle_bbox"] = vehicle_to_bbox_xyxy(vehicle)
    candidate["vehicle_type"] = vehicle.get("vehicle_type", "vehicle")
    candidate["vehicle_confidence"] = float(vehicle.get("confidence", 0.0))


def refine_damage_bbox(image_path: str, candidate: dict) -> None:
    hint = candidate.get("bbox")
    vehicle_bbox = candidate.get("vehicle_bbox")
    needs_refine = (
        not hint
        or bbox_is_full_frame(hint)
        or (vehicle_bbox and _bbox_iou(hint, vehicle_bbox) > 0.55)
    )
    if not needs_refine and hint and vehicle_bbox:
        dmg_area = max(0.001, (hint[2] - hint[0]) * (hint[3] - hint[1]))
        veh_area = max(
            0.001,
            (vehicle_bbox[2] - vehicle_bbox[0]) * (vehicle_bbox[3] - vehicle_bbox[1]),
        )
        needs_refine = dmg_area / veh_area > 0.45

    if not needs_refine:
        return

    region = localize_damage_region(
        image_path,
        vehicle_bbox=vehicle_bbox,
        hint_bbox=hint,
    )
    candidate["bbox"] = region["bbox"]
    candidate["damage_refined"] = True
    if region.get("confidence"):
        candidate["confidence"] = max(
            float(candidate.get("confidence", 0.0)),
            float(region["confidence"]) * 0.85,
        )


def enrich_damage_detections(
    image_path: str,
    candidates: list[dict],
    *,
    vehicles: list[dict] | None = None,
    vehicle_conf: float = 0.35,
    iou: float = 0.45,
) -> tuple[list[dict], list[dict]]:
    """
    For each damage detection: attach vehicle context + refine damage box.
    Returns (candidates, vehicles_used).
    """
    has_damage = any(c.get("detection_mode") == "damage" for c in candidates)
    if not has_damage:
        return candidates, vehicles or []

    if vehicles is None:
        vehicles = detect_vehicles(image_path, conf=vehicle_conf, iou=iou)

    for candidate in candidates:
        if candidate.get("detection_mode") != "damage":
            continue
        attach_vehicle_to_damage_candidate(candidate, vehicles)
        refine_damage_bbox(image_path, candidate)

    return candidates, vehicles


def vehicle_class_name(class_names: list[str]) -> str | None:
    priority = ("Vehicle", "Car", "Truck", "Bus", "Motorcycle")
    by_norm = {name.strip().lower().replace(" ", "_"): name for name in class_names}
    for pref in priority:
        key = pref.lower()
        if key in by_norm:
            return by_norm[key]
    for name in class_names:
        if detection_mode(name) == "vehicle":
            return name
    return None


def append_vehicle_predictions(
    candidates: list[dict],
    class_names: list[str],
    allowed_norm: set[str],
) -> list[dict]:
    """Add explicit Vehicle boxes alongside damage (for dual labeling / overlay)."""
    from app.services.driver.project_classes import normalize_class_name

    vname = vehicle_class_name(class_names)
    if not vname or normalize_class_name(vname) not in allowed_norm:
        return candidates

    extra: list[dict] = []
    seen: set[tuple[float, float, float, float]] = set()

    for cand in candidates:
        if cand.get("detection_mode") != "damage":
            continue
        vb = cand.get("vehicle_bbox")
        if not vb:
            continue
        key = tuple(round(v, 3) for v in vb)
        if key in seen:
            continue
        seen.add(key)
        extra.append({
            "class": vname,
            "detection_mode": "vehicle",
            "event_type": None,
            "confidence": float(cand.get("vehicle_confidence", 0.8)),
            "bbox": list(vb),
            "vehicle_bbox": list(vb),
            "vehicle_type": cand.get("vehicle_type", "vehicle"),
            "vehicle_confidence": float(cand.get("vehicle_confidence", 0.8)),
            "pipeline": cand.get("pipeline", "dual"),
            "paired_damage": cand.get("class"),
        })

    if not extra:
        return candidates
    return candidates + extra
