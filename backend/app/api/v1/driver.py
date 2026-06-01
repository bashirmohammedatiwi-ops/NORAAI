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
from app.schemas import DriverConfigResponse, DriverDetectResponse, DriverNearbyEvent, TelemetryRequest
from app.services.driver.detection import (
    DRIVER_ALERT_TYPES,
    create_events_from_detections,
    run_detection,
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


@router.get("/config", response_model=DriverConfigResponse)
async def driver_config(device: FleetDevice = Depends(get_fleet_device), db: AsyncSession = Depends(get_db)):
    artifact = await get_active_model(db, device.project_id)
    return DriverConfigResponse(
        project_id=device.project_id,
        device_id=device.device_id,
        vehicle_id=device.vehicle_id,
        model_ready=artifact is not None,
        model_name=artifact.name if artifact else None,
        classes=artifact.classes_used if artifact and artifact.classes_used else [
            "pothole", "accident", "road_closed", "traffic_violation"
        ],
        alert_types=DRIVER_ALERT_TYPES,
        speed_limit_kmh=80,
    )


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

    detections = await run_detection(db, device.project_id, content)
    alerts: list[dict] = []

    for det in detections:
        if det.get("event_type"):
            alerts.append({
                "type": det["event_type"],
                "label": det.get("class", det["event_type"]),
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
            "confidence": 1.0,
            "speed": speed,
            "speed_limit": speed_limit,
        })

    await _publish_events(device.project_id, events)

    return DriverDetectResponse(
        detections=detections,
        alerts=alerts,
        events_created=len(events),
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
