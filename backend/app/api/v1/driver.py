"""Driver app API — device auth, detection, telemetry, nearby events."""

import json
import math
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_fleet_device
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import FleetDevice, RoadEvent
from app.models.fleet_models import RoadEventType
from app.schemas import (
    DriverConfigResponse,
    DriverDetectResponse,
    DriverNearbyEvent,
    DriverProjectClass,
    DriverSpeedLimitResponse,
    TelemetryRequest,
)
from app.services.driver.detection import build_alert_types, create_events_from_detections, run_detection
from app.services.driver.speed_limit import get_road_speed_limit
from app.services.driver.project_classes import (
    allowed_detection_classes,
    get_project_classes,
    is_production_model,
    model_class_names,
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
    except Exception:
        pass


def _config_message(project_classes, artifact, model_ready: bool) -> str | None:
    if not project_classes:
        return "Add detection classes in the dashboard first."
    if not artifact:
        return "No active model. Train and deploy a model from the dashboard."
    if not model_ready:
        return "Model weights are not ready. Complete training on the dashboard."
    allowed = allowed_detection_classes(project_classes, artifact)
    if not allowed:
        return "Model classes do not match dashboard classes. Retrain the model."
    return None


@router.get("/config", response_model=DriverConfigResponse)
async def driver_config(device: FleetDevice = Depends(get_fleet_device), db: AsyncSession = Depends(get_db)):
    artifact = await get_active_model(db, device.project_id)
    project_classes = await get_project_classes(db, device.project_id)
    model_ready = is_production_model(artifact)
    allowed = allowed_detection_classes(project_classes, artifact) if model_ready else []
    message = _config_message(project_classes, artifact, model_ready)

    return DriverConfigResponse(
        project_id=device.project_id,
        device_id=device.device_id,
        vehicle_id=device.vehicle_id,
        model_ready=model_ready,
        model_name=artifact.name if artifact else None,
        model_classes=model_class_names(artifact) if artifact else [],
        project_classes=[
            DriverProjectClass(id=c.id, name=c.name, color=c.color) for c in project_classes
        ],
        classes=allowed if allowed else [c.name for c in project_classes],
        alert_types=build_alert_types(project_classes),
        speed_limit_kmh=80,
        road_speed_enabled=True,
        detection_enabled=model_ready and bool(allowed),
        message=message,
    )


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


@router.post("/detect", response_model=DriverDetectResponse)
async def driver_detect(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    speed: float | None = Form(None),
    speed_limit: float = Form(80),
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image")

    artifact = await get_active_model(db, device.project_id)
    model_ready = is_production_model(artifact)

    detections, infer_message, _meta = await run_detection(db, device.project_id, content)
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

    events = await create_events_from_detections(
        db, device.project_id, device, latitude, longitude, detections
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
    )


@router.get("/events/nearby", response_model=list[DriverNearbyEvent])
async def nearby_events(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    device: FleetDevice = Depends(get_fleet_device),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoadEvent).where(
            RoadEvent.project_id == device.project_id,
            RoadEvent.is_active == True,
        ).limit(500)
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
                )
            )
    nearby.sort(key=lambda e: e.distance_km)
    return nearby[:50]
