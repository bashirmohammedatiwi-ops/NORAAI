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
from app.services.driver.rdd_classes import RDD_CLASS_TO_EVENT, rdd_label_ar
from app.services.driver.roboflow_classes import ROBOFLOW_CLASS_TO_EVENT, roboflow_label_ar
from app.services.models.active_model import get_active_model
from app.services.models.artifact_weights import artifact_has_onnx, is_onnx_only_artifact

# YOLO / dataset alias -> road event type
CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "حوادث": RoadEventType.ACCIDENT,
    "حادث": RoadEventType.ACCIDENT,
    "حفر": RoadEventType.POTHOLE,
    "حفرة": RoadEventType.POTHOLE,
    "pothole": RoadEventType.POTHOLE,
    "manhole": RoadEventType.POTHOLE,
    "speedbreaker": RoadEventType.ROAD_CRACK,
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
        high_accuracy: bool = False,
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
            high_accuracy=high_accuracy,
        )


def map_class_to_event(class_name: str) -> RoadEventType | None:
    key = normalize_class_name(class_name)
    if key in {e.value for e in RoadEventType}:
        return RoadEventType(key)
    if key in RDD_CLASS_TO_EVENT:
        return RDD_CLASS_TO_EVENT[key]
    if key in ROBOFLOW_CLASS_TO_EVENT:
        return ROBOFLOW_CLASS_TO_EVENT[key]
    return CLASS_TO_EVENT.get(key)


def build_alert_types(project_classes: list) -> list[dict]:
    """Alert metadata from dashboard class definitions."""
    alerts: list[dict] = []
    for cls in project_classes:
        event_type = map_class_to_event(cls.name)
        ar_label = rdd_label_ar(cls.name) or roboflow_label_ar(cls.name) or cls.name
        alerts.append({
            "type": event_type.value if event_type else normalize_class_name(cls.name),
            "label": cls.name,
            "label_ar": ar_label,
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
    inference_imgsz: int | None = None,
    high_accuracy: bool = False,
) -> tuple[list[dict], str | None, dict]:
    settings = get_settings()
    t0 = time.perf_counter()

    try:
        from app.services.inference.class_names import get_weights_class_names
        from ml.detection.unified_detect import detect_simple_with_project_model, detect_with_project_model

        adapter = _CachedProjectAdapter(weights_key, weights_data, architecture)
        weights_stub = "cached"

        model_class_names = get_weights_class_names(
            weights_key, weights_data, architecture=architecture,
        )
        effective_class_names = model_class_names or class_names

        if simple:
            predictions, meta = detect_simple_with_project_model(
                image_bytes,
                weights_stub,
                adapter,
                effective_class_names,
                allowed_norm,
                settings=settings,
                min_confidence=min_confidence,
                imgsz=inference_imgsz,
                high_accuracy=high_accuracy,
            )
        else:
            predictions, meta = detect_with_project_model(
                image_bytes,
                weights_stub,
                adapter,
                effective_class_names,
                allowed_norm,
                settings=settings,
                min_confidence=min_confidence,
            )
        meta["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        meta["model_cached"] = True
        meta["model_class_names"] = model_class_names
        meta["artifact_class_names"] = class_names
        return predictions, None, meta
    except Exception as exc:
        return [], f"Inference failed: {exc}", {}


async def run_lab_cloud_detection(
    image_bytes: bytes,
    min_confidence: float | None = None,
) -> tuple[list[dict], str | None, dict] | None:
    """Use Ultralytics cloud predict (same pipeline as control-center lab)."""
    settings = get_settings()
    from app.services.lab.predict_client import (
        LabPredictError,
        call_predict,
        resolve_api_key,
        resolve_predict_url,
    )
    from app.services.lab.predict_parse import normalize_lab_detections

    url = resolve_predict_url(settings.cloud_predict_url)
    api_key = resolve_api_key(None)
    if not url or not api_key:
        return None

    conf = float(min_confidence) if min_confidence is not None else settings.cloud_predict_conf
    try:
        payload, latency_ms, _ = await call_predict(
            url=url,
            api_key=api_key,
            content=image_bytes,
            filename="driver.jpg",
            content_type="image/jpeg",
            conf=conf,
            iou=settings.cloud_predict_iou,
            imgsz=settings.cloud_predict_imgsz,
        )
    except LabPredictError as exc:
        return [], f"Cloud predict error: {exc.message}", {"pipeline": "lab_cloud"}
    except Exception as exc:
        return [], f"Cloud predict failed: {exc}", {"pipeline": "lab_cloud"}

    detections = normalize_lab_detections(payload)
    if min_confidence is not None:
        detections = [d for d in detections if d["confidence"] >= min_confidence]
    return detections, None, {"latency_ms": latency_ms, "pipeline": "lab_cloud"}


async def run_detection(
    db: AsyncSession,
    project_id: uuid.UUID,
    image_bytes: bytes,
    min_confidence: float | None = None,
    *,
    simple: bool = False,
    high_accuracy: bool = False,
) -> tuple[list[dict], str | None, dict]:
    """
    Run detection via cloud lab API when configured, else local YOLO/ONNX.
    Inference runs in a worker thread with a warm model cache for local path.
    """
    settings = get_settings()
    cloud = await run_lab_cloud_detection(image_bytes, min_confidence=min_confidence)
    if cloud is not None:
        return cloud

    artifact = await get_active_model(db, project_id)
    project_classes = await get_project_classes(db, project_id)

    if not project_classes:
        return [], "No classes defined in dashboard. Add classes in the project first.", {}

    if not is_production_model(artifact):
        return [], "No trained model deployed. Train and activate a model from the dashboard.", {}

    assert artifact is not None
    from app.services.inference.resolve_settings import resolve_inference_imgsz

    from app.services.driver.project_classes import model_class_names as artifact_class_names

    class_names = artifact_class_names(artifact)
    fast_path = simple or settings.driver_inference_simple
    if fast_path:
        allowed = list({*(class_names or []), *[c.name for c in project_classes]})
    else:
        allowed = allowed_detection_classes(project_classes, artifact)
    if not allowed and not fast_path:
        return [], "Model classes do not match dashboard classes. Retrain after updating classes.", {}

    allowed_norm = {normalize_class_name(n) for n in allowed}
    inference_imgsz = resolve_inference_imgsz(artifact, settings, manual_test=fast_path)

    try:
        if is_onnx_only_artifact(artifact):
            from app.services.inference.onnx_inference import run_onnx_detection_sync
            from app.services.models.artifact_weights import resolve_onnx_bytes

            try:
                onnx_data, _ = await asyncio.to_thread(resolve_onnx_bytes, artifact)
            except ValueError as exc:
                return [], str(exc), {}

            metrics = artifact.metrics or {}
            resize_mode = str(metrics.get("resize_mode") or "stretch")
            return await asyncio.to_thread(
                run_onnx_detection_sync,
                onnx_data,
                image_bytes,
                class_names,
                allowed_norm,
                min_confidence=min_confidence,
                inference_imgsz=inference_imgsz,
                resize_mode=resize_mode,
            )

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
            inference_imgsz=inference_imgsz,
            high_accuracy=high_accuracy and fast_path,
        )
    except Exception as exc:
        return [], f"Inference failed: {exc}", {}


async def preload_project_model(db: AsyncSession, project_id: uuid.UUID) -> bool:
    """Warm model cache for fleet camera sessions."""
    artifact = await get_active_model(db, project_id)
    if not is_production_model(artifact):
        return False
    assert artifact is not None
    if is_onnx_only_artifact(artifact):
        return artifact_has_onnx(artifact)
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
    *,
    event_source: str = "model",
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
    device_meta = dict(device.extra_metadata or {}) if device else {}
    for det in filtered:
        event_type_str = det.get("event_type")
        if not event_type_str:
            continue
        try:
            event_type = RoadEventType(event_type_str)
        except ValueError:
            continue
        meta = {
            "class": det.get("class"),
            "source": event_source,
            "bbox": det.get("bbox"),
        }
        if device:
            meta["vehicle_id"] = device.vehicle_id
            if device_meta.get("driver_name"):
                meta["driver_name"] = device_meta["driver_name"]
        if event_source == "citizen":
            meta["title"] = "تبليغ مواطن"
        event = RoadEvent(
            project_id=project_id,
            device_id=device.id if device else None,
            event_type=event_type,
            latitude=latitude,
            longitude=longitude,
            confidence=det.get("confidence"),
            extra_metadata={
                **meta,
            },
        )
        db.add(event)
        created.append(event)
    if created:
        await db.flush()
    return created
