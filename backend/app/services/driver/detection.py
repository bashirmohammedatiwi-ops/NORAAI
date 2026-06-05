"""Driver-facing detection and event mapping."""

from __future__ import annotations

import asyncio
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.minio_client import download_bytes
from app.services.inference.weights_store import get_weights_bytes
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


class _CachedProjectAdapter:
    """Adapter surface for unified_detect using in-memory YOLO cache."""

    def __init__(self, weights_key: str, weights_bytes: bytes, architecture: str):
        self.weights_key = weights_key
        self.weights_bytes = weights_bytes
        self.architecture = architecture

    def predict(
        self,
        _weights_path: str,
        image_source: str | bytes,
        *,
        conf: float = 0.25,
        iou: float = 0.45,
        imgsz: int | None = None,
    ) -> list[dict]:
        from app.services.inference.model_cache import predict_cached

        return predict_cached(
            self.weights_key,
            self.weights_bytes,
            image_source,
            architecture=self.architecture,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
        )


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


def _run_detection_sync(
    weights_key: str,
    weights_data: bytes,
    image_bytes: bytes,
    class_names: list,
    allowed_norm: set[str],
    architecture: str,
    min_confidence: float | None,
    *,
    simple: bool = False,
) -> tuple[list[dict], str | None, dict]:
    settings = get_settings()
    t0 = time.perf_counter()

    try:
        from ml.detection.unified_detect import detect_simple_with_project_model, detect_with_project_model

        adapter = _CachedProjectAdapter(weights_key, weights_data, architecture)
        weights_stub = "cached"
        detect_fn = detect_simple_with_project_model if simple else detect_with_project_model

        predictions, meta = detect_fn(
            image_bytes,
            weights_stub,
            adapter,
            class_names,
            allowed_norm,
            settings=settings,
            min_confidence=min_confidence,
        )
        meta["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        meta["model_cached"] = True
        return predictions, None, meta
    except Exception as exc:
        return [], f"Inference failed: {exc}", {}


async def run_detection(
    db: AsyncSession,
    project_id: uuid.UUID,
    image_bytes: bytes,
    min_confidence: float | None = None,
    *,
    simple: bool = False,
) -> tuple[list[dict], str | None, dict]:
    """
    Run YOLO using the project's active model and dashboard-defined classes only.
    Inference runs in a worker thread with a warm model cache.
    """
    artifact = await get_active_model(db, project_id)
    project_classes = await get_project_classes(db, project_id)

    if not project_classes:
        return [], "No classes defined in dashboard. Add classes in the project first.", {}

    if not is_production_model(artifact):
        return [], "No trained model deployed. Train and activate a model from the dashboard.", {}

    assert artifact is not None
    settings = get_settings()
    class_names = list(artifact.classes_used or [])
    fast_path = simple or settings.driver_inference_simple
    if fast_path:
        allowed = class_names or allowed_detection_classes(project_classes, artifact)
    else:
        allowed = allowed_detection_classes(project_classes, artifact)
    if not allowed:
        return [], "Model classes do not match dashboard classes. Retrain after updating classes.", {}

    allowed_norm = {normalize_class_name(n) for n in allowed}

    try:
        weights_data = get_weights_bytes(
            artifact.minio_weights_key,
            lambda: download_bytes(artifact.minio_weights_key),
        )
        if not weights_data or weights_data == b"mock_weights":
            return [], "Model weights missing or invalid. Run training again from the dashboard.", {}

        return await asyncio.to_thread(
            _run_detection_sync,
            artifact.minio_weights_key,
            weights_data,
            image_bytes,
            class_names,
            allowed_norm,
            artifact.architecture or "yolo11",
            min_confidence,
            simple=fast_path,
        )
    except Exception as exc:
        return [], f"Inference failed: {exc}", {}


async def preload_project_model(db: AsyncSession, project_id: uuid.UUID) -> bool:
    """Warm model cache for fleet camera sessions."""
    artifact = await get_active_model(db, project_id)
    if not is_production_model(artifact):
        return False
    assert artifact is not None
    try:
        weights_data = get_weights_bytes(
            artifact.minio_weights_key,
            lambda: download_bytes(artifact.minio_weights_key),
        )
    except Exception:
        return False
    if not weights_data or weights_data == b"mock_weights":
        return False

    def _warm() -> None:
        from app.services.inference.model_cache import get_cached_yolo

        get_cached_yolo(
            artifact.minio_weights_key,
            weights_data,
            architecture=artifact.architecture or "yolo11",
        )

    await asyncio.to_thread(_warm)
    return True


async def create_events_from_detections(
    db: AsyncSession,
    project_id: uuid.UUID,
    device: FleetDevice | None,
    latitude: float,
    longitude: float,
    detections: list[dict],
    min_confidence: float = 0.5,
) -> list[RoadEvent]:
    from app.services.driver.event_dedup import filter_detections_for_events

    filtered = await filter_detections_for_events(
        project_id,
        latitude,
        longitude,
        detections,
        device_id=device.id if device else None,
        min_confidence=min_confidence,
    )

    created: list[RoadEvent] = []
    for det in filtered:
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
