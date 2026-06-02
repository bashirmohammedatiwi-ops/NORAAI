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
from app.services.models.active_model import get_active_model

# YOLO / dataset alias -> road event type
CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "حوادث": RoadEventType.ACCIDENT,
    "حادث": RoadEventType.ACCIDENT,
    "حفر": RoadEventType.POTHOLE,
    "حفرة": RoadEventType.POTHOLE,
    "pothole": RoadEventType.POTHOLE,
    "accident": RoadEventType.ACCIDENT,
    "vehicle_damage": RoadEventType.ACCIDENT,
    "accident_damage": RoadEventType.ACCIDENT,
    "car_damage": RoadEventType.ACCIDENT,
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

        from ml.detection.unified_detect import detect_with_project_model
        from ml.training.adapters import get_adapter

        adapter = get_adapter(artifact.architecture or "yolo11")

        predictions, meta = detect_with_project_model(
            image_path,
            weights_path,
            adapter,
            class_names,
            allowed_norm,
            settings=settings,
            min_confidence=min_confidence,
        )

        Path(weights_path).unlink(missing_ok=True)
        Path(image_path).unlink(missing_ok=True)
        return predictions, None, meta
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
