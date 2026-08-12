import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis, get_sync_redis
from app.models import FleetDevice, RoadEvent, RoadEventType
from app.schemas import RoadEventCreate
from app.services.road.event_helpers import serialize_road_event

router = APIRouter(tags=["road-intelligence"])


@router.get("/road-intelligence/{project_id}/stats")
async def road_stats(project_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.services.models.active_model import get_active_model

    artifact = await get_active_model(db, project_id)
    vehicles = await db.execute(
        select(func.count(FleetDevice.id)).where(
            FleetDevice.project_id == project_id, FleetDevice.is_online == True
        )
    )
    accidents = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.event_type == RoadEventType.ACCIDENT,
            RoadEvent.is_active == True,
        )
    )
    potholes = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id, RoadEvent.event_type == RoadEventType.POTHOLE
        )
    )
    speed_bumps = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id, RoadEvent.event_type == RoadEventType.SPEED_BUMP
        )
    )
    municipality_alerts = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.is_active == True,
            RoadEvent.event_type.in_([RoadEventType.POTHOLE, RoadEventType.SPEED_BUMP]),
        )
    )
    closed = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.event_type == RoadEventType.ROAD_CLOSED,
            RoadEvent.is_active == True,
        )
    )
    violations = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.event_type == RoadEventType.TRAFFIC_VIOLATION,
        )
    )
    total_devices = await db.execute(
        select(func.count(FleetDevice.id)).where(FleetDevice.project_id == project_id)
    )

    return {
        "total_vehicles_reporting": vehicles.scalar() or 0,
        "total_devices": total_devices.scalar() or 0,
        "active_accidents": accidents.scalar() or 0,
        "closed_roads": closed.scalar() or 0,
        "potholes_detected": potholes.scalar() or 0,
        "speed_bumps_detected": speed_bumps.scalar() or 0,
        "municipality_alerts": municipality_alerts.scalar() or 0,
        "traffic_violations": violations.scalar() or 0,
        "road_issues_detected": (potholes.scalar() or 0) + (speed_bumps.scalar() or 0) + (accidents.scalar() or 0),
        "active_model": {
            "ready": artifact is not None,
            "name": artifact.name if artifact else None,
            "architecture": artifact.architecture if artifact else None,
        },
    }


@router.get("/road-intelligence/{project_id}/events")
async def road_events(
    project_id: UUID,
    active_only: bool = Query(True),
    event_type: str | None = None,
    recipient: str | None = None,
    municipality: str | None = None,
    limit: int = Query(500, le=1000),
    db: AsyncSession = Depends(get_db),
):
    query = select(RoadEvent).where(RoadEvent.project_id == project_id)
    if active_only:
        query = query.where(RoadEvent.is_active == True)
    if event_type:
        try:
            query = query.where(RoadEvent.event_type == RoadEventType(event_type))
        except ValueError:
            pass
    query = query.order_by(RoadEvent.created_at.desc()).limit(limit)
    result = await db.execute(query)
    events = [serialize_road_event(e) for e in result.scalars().all()]

    if recipient:
        events = [e for e in events if e["recipient"] == recipient]
    if municipality:
        events = [e for e in events if e.get("municipality_id") == municipality]

    return events


@router.post("/road-intelligence/{project_id}/events")
async def create_road_event(project_id: UUID, data: RoadEventCreate, db: AsyncSession = Depends(get_db)):
    event = RoadEvent(
        project_id=project_id,
        event_type=RoadEventType(data.event_type),
        latitude=data.latitude,
        longitude=data.longitude,
        confidence=data.confidence,
        extra_metadata=data.metadata or {},
    )
    db.add(event)
    await db.flush()
    payload = serialize_road_event(event)
    payload["action"] = "created"
    try:
        redis = await get_redis()
        await redis.publish(f"road:{project_id}", json.dumps(payload))
    except Exception:
        pass
    await db.commit()
    return payload


@router.patch("/road-intelligence/{project_id}/events/{event_id}/resolve")
async def resolve_road_event(
    project_id: UUID,
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoadEvent).where(RoadEvent.id == event_id, RoadEvent.project_id == project_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.is_active:
        return serialize_road_event(event)

    event.is_active = False
    event.resolved_at = datetime.now(timezone.utc)
    await db.flush()

    payload = serialize_road_event(event)
    payload["action"] = "resolved"
    try:
        redis = await get_redis()
        await redis.publish(f"road:{project_id}", json.dumps(payload))
    except Exception:
        pass
    await db.commit()
    return payload


@router.websocket("/ws/road-intelligence/{project_id}")
async def road_intelligence_ws(websocket: WebSocket, project_id: str):
    await websocket.accept()
    pubsub = get_sync_redis().pubsub()
    pubsub.subscribe(f"road:{project_id}")
    try:
        while True:
            message = pubsub.get_message(timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pubsub.unsubscribe(f"road:{project_id}")
