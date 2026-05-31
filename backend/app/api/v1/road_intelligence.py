from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis, get_sync_redis
from app.models import FleetDevice, RoadEvent, RoadEventType
from app.schemas import RoadEventCreate

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
        "traffic_violations": violations.scalar() or 0,
        "road_issues_detected": (potholes.scalar() or 0) + (accidents.scalar() or 0),
        "active_model": {
            "ready": artifact is not None,
            "name": artifact.name if artifact else None,
            "architecture": artifact.architecture if artifact else None,
        },
    }


@router.get("/road-intelligence/{project_id}/events")
async def road_events(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RoadEvent).where(RoadEvent.project_id == project_id, RoadEvent.is_active == True).limit(500)
    )
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type.value,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "confidence": e.confidence,
            "created_at": e.created_at.isoformat(),
        }
        for e in result.scalars().all()
    ]


@router.post("/road-intelligence/{project_id}/events")
async def create_road_event(project_id: UUID, data: RoadEventCreate, db: AsyncSession = Depends(get_db)):
    event = RoadEvent(
        project_id=project_id,
        event_type=RoadEventType(data.event_type),
        latitude=data.latitude,
        longitude=data.longitude,
        confidence=data.confidence,
    )
    db.add(event)
    await db.flush()
    return {"id": str(event.id), "event_type": event.event_type.value}


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
