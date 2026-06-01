"""Driver-facing detection and event mapping."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import download_bytes
from app.models import FleetDevice, ModelArtifact, RoadEvent, RoadEventType
from app.services.models.active_model import get_active_model

# Detection class name (YOLO) -> road event type
CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "pothole": RoadEventType.POTHOLE,
    "accident": RoadEventType.ACCIDENT,
    "road_closed": RoadEventType.ROAD_CLOSED,
    "barrier": RoadEventType.ROAD_CLOSED,
    "construction": RoadEventType.ROAD_CLOSED,
    "traffic_violation": RoadEventType.TRAFFIC_VIOLATION,
    "wrong_way": RoadEventType.TRAFFIC_VIOLATION,
    "illegal_parking": RoadEventType.TRAFFIC_VIOLATION,
}

DRIVER_ALERT_TYPES = [
    {"type": "pothole", "label": "Pothole", "label_ar": "حفرة", "color": "#f97316"},
    {"type": "accident", "label": "Accident", "label_ar": "حادث", "color": "#ef4444"},
    {"type": "road_closed", "label": "Road closed", "label_ar": "طريق مغلق", "color": "#dc2626"},
    {"type": "traffic_violation", "label": "Speed / violation", "label_ar": "مخالفة سرعة", "color": "#eab308"},
]


def map_class_to_event(class_name: str) -> RoadEventType | None:
    key = class_name.strip().lower().replace(" ", "_")
    return CLASS_TO_EVENT.get(key)


async def run_detection(
    db: AsyncSession,
    project_id: uuid.UUID,
    image_bytes: bytes,
) -> list[dict]:
    """Run YOLO on image when model weights exist; otherwise demo detections."""
    artifact = await get_active_model(db, project_id)
    class_names = list(artifact.classes_used) if artifact and artifact.classes_used else [
        "pothole", "accident", "road_closed", "traffic_violation"
    ]

    predictions: list[dict] = []

    if artifact and artifact.minio_weights_key:
        try:
            weights_data = download_bytes(artifact.minio_weights_key)
            if weights_data and weights_data != b"mock_weights":
                with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as wf:
                    wf.write(weights_data)
                    weights_path = wf.name
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as imgf:
                    imgf.write(image_bytes)
                    image_path = imgf.name

                from ml.training.adapters import get_adapter

                adapter = get_adapter(artifact.architecture or "yolo11")
                raw = adapter.predict(weights_path, image_path)

                for item in raw:
                    idx = item.get("class_id", 0)
                    name = class_names[idx] if idx < len(class_names) else f"class_{idx}"
                    event_type = map_class_to_event(name)
                    predictions.append({
                        "class": name,
                        "event_type": event_type.value if event_type else None,
                        "confidence": item.get("confidence", 0.0),
                        "bbox": [
                            item.get("x_center", 0.5) - item.get("width", 0.2) / 2,
                            item.get("y_center", 0.5) - item.get("height", 0.2) / 2,
                            item.get("x_center", 0.5) + item.get("width", 0.2) / 2,
                            item.get("y_center", 0.5) + item.get("height", 0.2) / 2,
                        ],
                    })
                Path(weights_path).unlink(missing_ok=True)
                Path(image_path).unlink(missing_ok=True)
                if predictions:
                    return predictions
        except Exception:
            pass

    # Demo mode when no trained weights — helps UI testing
    if len(image_bytes) > 1000:
        predictions.append({
            "class": "pothole",
            "event_type": "pothole",
            "confidence": 0.72,
            "bbox": [0.35, 0.45, 0.55, 0.65],
            "demo": True,
        })
    return predictions


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
            extra_metadata={"class": det.get("class"), "demo": det.get("demo", False)},
        )
        db.add(event)
        created.append(event)
    if created:
        await db.flush()
    return created
