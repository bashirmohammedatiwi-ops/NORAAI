"""Driver-facing detection and event mapping."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.minio_client import download_bytes
from app.models import FleetDevice, RoadEvent, RoadEventType
from app.services.driver.project_classes import (
    allowed_detection_classes,
    get_project_classes,
    is_production_model,
    normalize_class_name,
)
from app.services.inference.filters import filter_detections
from app.services.models.active_model import get_active_model

# YOLO / dataset alias -> road event type
CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "pothole": RoadEventType.POTHOLE,
    "accident": RoadEventType.ACCIDENT,
    "road_closed": RoadEventType.ROAD_CLOSED,
    "barrier": RoadEventType.ROAD_CLOSED,
    "construction": RoadEventType.CONSTRUCTION,
    "traffic_violation": RoadEventType.TRAFFIC_VIOLATION,
    "wrong_way": RoadEventType.TRAFFIC_VIOLATION,
    "illegal_parking": RoadEventType.TRAFFIC_VIOLATION,
    "road_crack": RoadEventType.ROAD_CRACK,
    "flooded_road": RoadEventType.FLOODED_ROAD,
}


def map_class_to_event(class_name: str) -> RoadEventType | None:
    key = normalize_class_name(class_name)
    if key in {e.value for e in RoadEventType}:
        return RoadEventType(key)
    return CLASS_TO_EVENT.get(key)


def build_alert_types(project_classes: list) -> list[dict]:
    """Alert metadata from dashboard class definitions."""
    alerts: list[dict] = []
    for cls in project_classes:
        event_type = map_class_to_event(cls.name)
        alerts.append({
            "type": event_type.value if event_type else normalize_class_name(cls.name),
            "label": cls.name,
            "label_ar": cls.name,
            "color": cls.color or "#64748b",
            "class_name": cls.name,
        })
    return alerts


async def run_detection(
    db: AsyncSession,
    project_id: uuid.UUID,
    image_bytes: bytes,
    min_confidence: float | None = None,
) -> tuple[list[dict], str | None, dict]:
    """
    Run YOLO using the project's active model and dashboard-defined classes only.
    Returns (predictions, error_message, meta).
    """
    settings = get_settings()
    artifact = await get_active_model(db, project_id)
    project_classes = await get_project_classes(db, project_id)

    if not project_classes:
        return [], "No classes defined in dashboard. Add classes in the project first.", {}

    if not is_production_model(artifact):
        return [], "No trained model deployed. Train and activate a model from the dashboard.", {}

    assert artifact is not None
    allowed = allowed_detection_classes(project_classes, artifact)
    if not allowed:
        return [], "Model classes do not match dashboard classes. Retrain after updating classes.", {}

    allowed_norm = {normalize_class_name(n) for n in allowed}
    class_names = list(artifact.classes_used or [])
    class_count = max(len(class_names), 1)

    try:
        weights_data = download_bytes(artifact.minio_weights_key)
        if not weights_data or weights_data == b"mock_weights":
            return [], "Model weights missing or invalid. Run training again from the dashboard.", {}

        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as wf:
            wf.write(weights_data)
            weights_path = wf.name
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as imgf:
            imgf.write(image_bytes)
            image_path = imgf.name

        from ml.detection.two_stage import classify_vehicles_two_stage
        from ml.training.adapters import get_adapter

        adapter = get_adapter(artifact.architecture or "yolo11")
        yolo_conf = min(0.2, settings.inference_confidence_threshold)

        raw_items, vehicles = classify_vehicles_two_stage(
            image_path,
            weights_path,
            adapter,
            yolo_conf=yolo_conf,
            iou=settings.inference_iou_threshold,
            vehicle_conf=0.35,
        )

        candidates: list[dict] = []
        for item in raw_items:
            idx = item.get("class_id", 0)
            name = class_names[idx] if idx < len(class_names) else f"class_{idx}"
            if normalize_class_name(name) not in allowed_norm:
                continue
            event_type = map_class_to_event(name)
            cx = item.get("x_center", 0.5)
            cy = item.get("y_center", 0.5)
            w = item.get("width", 0.2)
            h = item.get("height", 0.2)
            candidates.append({
                "class": name,
                "event_type": event_type.value if event_type else None,
                "confidence": item.get("confidence", 0.0),
                "bbox": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
                "vehicle_bbox": item.get("vehicle_bbox"),
                "vehicle_type": item.get("vehicle_type"),
                "vehicle_confidence": item.get("vehicle_confidence"),
                "pipeline": "two_stage",
            })

        predictions, threshold, warnings = filter_detections(
            candidates,
            class_count=class_count,
            min_confidence=min_confidence,
            settings=settings,
        )

        if not vehicles:
            warnings = list(warnings) + [
                "No vehicle detected in the image — class was not assigned. "
                "Ensure the car is visible and retrain with vehicle-region labels.",
            ]

        Path(weights_path).unlink(missing_ok=True)
        Path(image_path).unlink(missing_ok=True)
        return predictions, None, {
            "confidence_threshold": threshold,
            "class_count": class_count,
            "raw_detection_count": len(candidates),
            "vehicle_count": len(vehicles),
            "pipeline": "two_stage",
            "warnings": warnings,
        }
    except Exception as exc:
        return [], f"Inference failed: {exc}", {}


async def create_events_from_detections(
    db: AsyncSession,
    project_id: uuid.UUID,
    device: FleetDevice | None,
    latitude: float,
    longitude: float,
    detections: list[dict],
    min_confidence: float = 0.5,
) -> list[RoadEvent]:
    created: list[RoadEvent] = []
    for det in detections:
        if det.get("confidence", 0) < min_confidence:
            continue
        event_type_str = det.get("event_type")
        if not event_type_str:
            continue
        try:
            event_type = RoadEventType(event_type_str)
        except ValueError:
            continue
        event = RoadEvent(
            project_id=project_id,
            device_id=device.id if device else None,
            event_type=event_type,
            latitude=latitude,
            longitude=longitude,
            confidence=det.get("confidence"),
            extra_metadata={"class": det.get("class"), "source": "model"},
        )
        db.add(event)
        created.append(event)
    if created:
        await db.flush()
    return created
