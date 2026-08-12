from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FleetDeviceResponse
from app.core.database import get_db
from app.models import FleetDevice
from app.services.fleet.status import fleet_device_is_online

router = APIRouter(tags=["fleet"])


@router.get("/fleet/{project_id}", response_model=list[FleetDeviceResponse])
async def list_fleet(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetDevice).where(FleetDevice.project_id == project_id))
    devices = list(result.scalars().all())
    return [
        FleetDeviceResponse(
            id=str(d.id),
            device_id=d.device_id,
            vehicle_id=d.vehicle_id,
            driver_name=(d.extra_metadata or {}).get("driver_name"),
            phone_number=(d.extra_metadata or {}).get("phone_number"),
            is_online=fleet_device_is_online(d),
            gps_status=d.gps_status,
            camera_status=d.camera_status,
            latitude=d.latitude,
            longitude=d.longitude,
            last_communication=d.last_communication.isoformat() if d.last_communication else None,
        )
        for d in devices
    ]
