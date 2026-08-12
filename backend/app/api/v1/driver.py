"""Driver app API — device auth, detection, telemetry, nearby events."""

import json
import math
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_fleet_device
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import FleetDevice, Project, RoadEvent
from app.models.fleet_models import RoadEventType
from app.schemas import (
    DriverConfigResponse,
    DriverDetectResponse,
    DriverModelManifest,
    DriverNearbyEvent,
    DriverProjectClass,
    DriverReportDetectionsRequest,
    DriverSpeedLimitResponse,
    DriverSpeedViolationRequest,
    SpeedViolationConfig,
    TelemetryRequest,
)
from app.services.mobile.config import get_mobile_config
from app.services.mobile.driver_deploy import (
    build_model_manifest,
    ensure_mobile_onnx_bytes,
    ensure_mobile_onnx_meta,
    iter_mobile_onnx_chunks,
    load_stored_mobile_manifest,
    resolve_driver_artifact,
)
from app.core.config import get_settings
from app.services.driver.detection import (
    build_alert_types,
    create_events_from_detections,
    map_class_to_event,
    preload_project_model,
    run_detection,
)
from app.services.driver.speed_limit import get_road_speed_limit
from app.services.driver.project_classes import (
    allowed_detection_classes,
    ensure_project_classes,
    get_project_classes,
    is_production_model,
    model_class_names,
    normalize_class_name,
    normalize_classes_used,
)
from app.services.models.active_model import get_active_model

router = APIRouter(prefix="/driver", tags=["driver"])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _publish_events(project_id: UUID, events: list[RoadEvent]) -> None:
    if not events:
        return
    try:
        redis = await get_redis()
        for event in events:
            payload = json.dumps({
                "id": str(event.id),
                "event_type": event.event_type.value,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "confidence": event.confidence,
            })
            await redis.publish(f"road:{project_id}", payload)
            await redis.publish(f"mobile:{project_id}", payload)
    except Exception:
        pass


def _config_message(project_classes, artifact, model_ready: bool) -> str | None:
    if not artifact:
        return (
            "No trained model found. Open Models in the dashboard, train the unified model, "
            "then use Mobile App → Sync model."
        )
    if not model_ready:
        return "Model weights are not ready. Complete training on the dashboard."
    allowed = allowed_detection_classes(project_classes, artifact)
    if not allowed:
        metrics = artifact.metrics or {}
        if metrics.get("imported") and model_class_names(artifact):
            return None
        if not project_classes:
            return "Add detection classes in the dashboard first."
        return "Model classes do not match dashboard classes. Retrain the model."
    return None


@router.get("/bootstrap")
async def driver_bootstrap(db: AsyncSession = Depends(get_db)):
    """Default project for mobile auto-registration (no login screen)."""
    result = await db.execute(
        select(Project).where(Project.name == "Road Infrastructure Monitoring").limit(1)
    )
    project = result.scalar_one_or_none()
    if not project:
        result = await db.execute(select(Project).order_by(Project.created_at).limit(1))
        project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=503, detail="No project configured on server")
    return {
        "project_id": str(project.id),
        "project_name": project.name,
    }


@router.get("/config", response_model=DriverConfigResponse)
async def driver_config(device: FleetDevice = Depends(get_fleet_device), db: AsyncSession = Depends(get_db)):
    from app.models import Project

    project = await db.get(Project, device.project_id)
    artifact = (
        await resolve_driver_artifact(db, project)
        if project
        else await get_active_model(db, device.project_id)
    )
    project_classes = await get_project_classes(db, device.project_id)
    model_ready = is_production_model(artifact)
    if model_ready and artifact:
        metrics = artifact.metrics or {}
        if metrics.get("imported"):
            model_names = normalize_classes_used(artifact.classes_used)
            if model_names:
                project_names = {normalize_class_name(c.name) for c in project_classes}
                missing = any(normalize_class_name(n) not in project_names for n in model_names)
                if missing:
                    project_classes = await ensure_project_classes(
                        db, device.project_id, model_names
                    )
    allowed = allowed_detection_classes(project_classes, artifact) if model_ready else []
    message = _config_message(project_classes, artifact, model_ready)

    mobile_cfg = get_mobile_config(project)
    speed_cfg = mobile_cfg.get("speed_violation") or {}
    camera_cfg = mobile_cfg.get("camera") or {}
    deployment = mobile_cfg.get("deployment") if isinstance(mobile_cfg.get("deployment"), dict) else {}

    model_version = deployment.get("model_version")
    model_sha256 = deployment.get("sha256")
    if model_ready and artifact and not model_version:
        try:
            _, model_sha256 = ensure_mobile_onnx_bytes(artifact)
            model_version = model_sha256[:16] if model_sha256 else None
        except Exception:
            pass

    inference_mode = str(mobile_cfg.get("inference_mode") or "server")
    model_names = model_class_names(artifact) if artifact else []
    settings = get_settings()
    cloud_ready = bool(settings.cloud_predict_url.strip() and settings.cloud_predict_api_key.strip())
    model_ready = model_ready or cloud_ready
    detection_on = bool(mobile_cfg.get("detection_enabled", True)) and model_ready
    if not cloud_ready:
        detection_on = detection_on and bool(allowed or model_names)

    return DriverConfigResponse(
        project_id=device.project_id,
        device_id=device.device_id,
        vehicle_id=device.vehicle_id,
        model_ready=model_ready,
        model_name=artifact.name if artifact else None,
        model_artifact_id=artifact.id if artifact else None,
        model_version=model_version,
        model_sha256=model_sha256,
        model_classes=model_class_names(artifact) if artifact else [],
        project_classes=[
            DriverProjectClass(id=c.id, name=c.name, color=c.color) for c in project_classes
        ],
        classes=allowed if allowed else [c.name for c in project_classes],
        alert_types=build_alert_types(project_classes),
        speed_limit_kmh=float(speed_cfg.get("fallback_limit_kmh") or 80),
        road_speed_enabled=True,
        detection_enabled=detection_on,
        inference_mode=inference_mode,
        min_confidence=float(mobile_cfg.get("min_confidence") or 0.45),
        scan_fps=int(mobile_cfg.get("scan_fps") or 12),
        speed_violation=SpeedViolationConfig(
            enabled=bool(speed_cfg.get("enabled", True)),
            tolerance_kmh=float(speed_cfg.get("tolerance_kmh", 5)),
            grace_seconds=float(speed_cfg.get("grace_seconds", 3)),
            cooldown_seconds=int(speed_cfg.get("cooldown_seconds", 60)),
            fallback_limit_kmh=float(speed_cfg.get("fallback_limit_kmh", 80)),
        ),
        message=message,
        scan_interval_ms=settings.driver_scan_interval_ms,
        scan_interval_fast_ms=settings.driver_scan_interval_fast_ms,
        speed_fast_kmh=settings.driver_speed_fast_kmh,
        capture_max_width=int(camera_cfg.get("max_width") or settings.driver_capture_max_width),
        jpeg_quality=float(camera_cfg.get("jpeg_quality") or settings.driver_jpeg_quality),
    )


@router.post("/warmup")
async def driver_warmup(
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    """Pre-load YOLO weights for low-latency camera frames."""
    ok = await preload_project_model(db, device.project_id)
    return {"ready": ok}


@router.get("/speed-limit", response_model=DriverSpeedLimitResponse)
async def driver_speed_limit(
    latitude: float,
    longitude: float,
    fallback: float = 80,
    device: FleetDevice = Depends(get_fleet_device),
):
    del device
    data = await get_road_speed_limit(latitude, longitude, fallback)
    return DriverSpeedLimitResponse(**data)


@router.post("/telemetry")
async def driver_telemetry(
    data: TelemetryRequest,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from app.models import DeviceTelemetry

    device.latitude = data.latitude
    device.longitude = data.longitude
    device.gps_status = data.gps_status
    device.camera_status = data.camera_status
    device.is_online = True
    device.last_communication = datetime.now(timezone.utc)

    meta = dict(device.extra_metadata or {})
    if data.app_version:
        meta["app_version"] = data.app_version
    if data.model_version:
        meta["model_version"] = data.model_version
    if data.model_sha256:
        meta["model_sha256"] = data.model_sha256
    if data.driver_name:
        meta["driver_name"] = data.driver_name.strip()
    meta["vehicle_id"] = device.vehicle_id
    meta["last_sync_at"] = datetime.now(timezone.utc).isoformat()
    device.extra_metadata = meta

    db.add(
        DeviceTelemetry(
            device_id=device.id,
            latitude=data.latitude,
            longitude=data.longitude,
            gps_status=data.gps_status,
            camera_status=data.camera_status,
            speed=data.speed,
        )
    )
    await db.flush()

    redis = await get_redis()
    await redis.setex(f"fleet:online:{device.device_id}", 60, "1")
    return {"status": "ok", "device_id": device.device_id}


@router.get("/model/manifest", response_model=DriverModelManifest)
async def driver_model_manifest(
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    from app.models import Project

    project = await db.get(Project, device.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    artifact = await resolve_driver_artifact(db, project)
    if not artifact:
        raise HTTPException(status_code=404, detail="No model deployed for mobile app")
    stored = load_stored_mobile_manifest(artifact)
    try:
        if stored and stored.get("sha256"):
            _, sha256, byte_len = ensure_mobile_onnx_meta(artifact)
            manifest = dict(stored)
            if not manifest.get("resize_mode"):
                metrics = artifact.metrics or {}
                manifest["resize_mode"] = str(metrics.get("resize_mode") or "letterbox")
            if not manifest.get("model_bytes") and byte_len > 0:
                manifest = build_model_manifest(artifact, sha256, onnx_byte_len=byte_len)
        else:
            onnx_bytes, sha256 = ensure_mobile_onnx_bytes(artifact)
            manifest = build_model_manifest(artifact, sha256, onnx_byte_len=len(onnx_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DriverModelManifest(
        artifact_id=artifact.id,
        model_name=manifest["model_name"],
        architecture=manifest["architecture"],
        version=manifest["version"],
        sha256=manifest["sha256"],
        format=manifest["format"],
        image_size=manifest["image_size"],
        resize_mode=manifest.get("resize_mode", "letterbox"),
        nc=manifest["nc"],
        classes=manifest["classes"],
        model_size_mb=manifest.get("model_size_mb"),
        model_bytes=manifest.get("model_bytes"),
        updated_at=manifest["updated_at"],
        download_url="/api/v1/driver/model/download",
    )


@router.get("/model/download")
async def driver_model_download(
    request: Request,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    from app.models import Project

    project = await db.get(Project, device.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    artifact = await resolve_driver_artifact(db, project)
    if not artifact:
        raise HTTPException(status_code=404, detail="No model deployed for mobile app")
    try:
        _, sha256, total_size = ensure_mobile_onnx_meta(artifact)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    start = 0
    range_header = request.headers.get("range") or request.headers.get("Range")
    if range_header:
        part = range_header.replace("bytes=", "").strip()
        if "-" in part:
            start_str = part.split("-", 1)[0].strip()
            if start_str.isdigit():
                start = int(start_str)

    if start >= total_size:
        raise HTTPException(status_code=416, detail="Range not satisfiable")

    content_length = total_size - start
    headers = {
        "Content-Disposition": f'attachment; filename="model_{artifact.id}.onnx"',
        "Content-Length": str(content_length),
        "Accept-Ranges": "bytes",
        "X-Model-Version": sha256[:16],
        "X-Model-Sha256": sha256,
        "X-Model-Bytes": str(total_size),
    }
    status_code = 200
    if start > 0:
        headers["Content-Range"] = f"bytes {start}-{total_size - 1}/{total_size}"
        status_code = 206

    return StreamingResponse(
        iter_mobile_onnx_chunks(artifact, offset=start),
        status_code=status_code,
        media_type="application/octet-stream",
        headers=headers,
    )


@router.post("/violations")
async def report_speed_violation(
    data: DriverSpeedViolationRequest,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    from app.services.driver.event_dedup import should_create_event

    allowed = await should_create_event(
        device.project_id,
        RoadEventType.TRAFFIC_VIOLATION.value,
        data.latitude,
        data.longitude,
        device_id=device.id,
    )
    if not allowed:
        return {"created": False, "reason": "cooldown"}

    event = RoadEvent(
        project_id=device.project_id,
        device_id=device.id,
        event_type=RoadEventType.TRAFFIC_VIOLATION,
        latitude=data.latitude,
        longitude=data.longitude,
        confidence=1.0,
        extra_metadata={
            "speed": data.speed,
            "speed_limit": data.speed_limit,
            "road_name": data.road_name,
            "duration_seconds": data.duration_seconds,
            "source": "mobile_gps",
        },
    )
    db.add(event)
    await db.flush()
    await _publish_events(device.project_id, [event])
    return {"created": True, "event_id": str(event.id)}


@router.post("/detections/report", response_model=DriverDetectResponse)
async def report_client_detections(
    body: DriverReportDetectionsRequest,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    """Register road events from on-device ONNX detections (no image upload)."""
    min_conf = body.min_confidence if body.min_confidence is not None else 0.45
    detections: list[dict] = []
    alerts: list[dict] = []

    for item in body.detections:
        if item.confidence < min_conf:
            continue
        event_type = item.event_type
        if not event_type:
            mapped = map_class_to_event(item.class_name)
            event_type = mapped.value if mapped else None
        det = {
            "class": item.class_name,
            "confidence": item.confidence,
            "bbox": item.bbox,
            "event_type": event_type,
        }
        detections.append(det)
        alerts.append({
            "type": event_type or item.class_name,
            "label": item.class_name,
            "class_name": item.class_name,
            "confidence": item.confidence,
            "bbox": item.bbox,
        })

    events = await create_events_from_detections(
        db,
        device.project_id,
        device,
        body.latitude,
        body.longitude,
        detections,
        min_confidence=min_conf,
    )
    await _publish_events(device.project_id, events)

    return DriverDetectResponse(
        detections=detections,
        alerts=alerts,
        events_created=len(events),
        model_ready=True,
        message=None,
        latency_ms=None,
        pipeline="mobile_onnx",
    )


@router.post("/detect", response_model=DriverDetectResponse)
async def driver_detect(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    speed: float | None = Form(None),
    speed_limit: float = Form(80),
    min_confidence: float | None = Form(None),
    source: str | None = Form(None),
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image")

    artifact = await get_active_model(db, device.project_id)
    model_ready = is_production_model(artifact)

    detections, infer_message, meta = await run_detection(
        db,
        device.project_id,
        content,
        min_confidence=min_confidence,
    )
    alerts: list[dict] = []

    for det in detections:
        cls_name = det.get("class", "")
        alerts.append({
            "type": det.get("event_type") or cls_name,
            "label": cls_name,
            "class_name": cls_name,
            "confidence": det.get("confidence", 0),
            "bbox": det.get("bbox"),
        })

    event_min_conf = float(min_confidence) if min_confidence is not None else 0.5
    event_source = (source or "camera").strip() or "camera"
    if event_source == "citizen":
        event_source = "citizen"
    events = await create_events_from_detections(
        db,
        device.project_id,
        device,
        latitude,
        longitude,
        detections,
        min_confidence=event_min_conf,
        event_source=event_source,
    )

    if speed is not None and speed > speed_limit:
        speed_event = RoadEvent(
            project_id=device.project_id,
            device_id=device.id,
            event_type=RoadEventType.TRAFFIC_VIOLATION,
            latitude=latitude,
            longitude=longitude,
            confidence=1.0,
            extra_metadata={"speed": speed, "speed_limit": speed_limit, "source": "gps"},
        )
        db.add(speed_event)
        await db.flush()
        events.append(speed_event)
        alerts.append({
            "type": "traffic_violation",
            "label": "speed_violation",
            "class_name": "speed_violation",
            "confidence": 1.0,
            "speed": speed,
            "speed_limit": speed_limit,
        })

    await _publish_events(device.project_id, events)

    return DriverDetectResponse(
        detections=detections,
        alerts=alerts,
        events_created=len(events),
        model_ready=model_ready,
        message=infer_message,
        latency_ms=meta.get("latency_ms"),
        pipeline=meta.get("pipeline"),
    )


@router.get("/events/nearby", response_model=list[DriverNearbyEvent])
async def nearby_events(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    delta_lat = radius_km / 111.0
    cos_lat = max(math.cos(math.radians(latitude)), 0.2)
    delta_lon = radius_km / (111.0 * cos_lat)

    result = await db.execute(
        select(RoadEvent).where(
            RoadEvent.project_id == device.project_id,
            RoadEvent.is_active == True,
            RoadEvent.latitude >= latitude - delta_lat,
            RoadEvent.latitude <= latitude + delta_lat,
            RoadEvent.longitude >= longitude - delta_lon,
            RoadEvent.longitude <= longitude + delta_lon,
        ).limit(200)
    )
    nearby: list[DriverNearbyEvent] = []
    for event in result.scalars().all():
        dist = _haversine_km(latitude, longitude, event.latitude, event.longitude)
        if dist <= radius_km:
            nearby.append(
                DriverNearbyEvent(
                    id=event.id,
                    event_type=event.event_type.value,
                    latitude=event.latitude,
                    longitude=event.longitude,
                    confidence=event.confidence,
                    distance_km=round(dist, 2),
                    metadata=event.extra_metadata or {},
                )
            )
    nearby.sort(key=lambda e: e.distance_km)
    return nearby[:50]
