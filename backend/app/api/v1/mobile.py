"""Dashboard API — Mobile Command Center."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import FleetDevice, ModelArtifact, Project, RoadEvent, User
from app.models.fleet_models import RoadEventType
from app.schemas import (
    MobileAppConfig,
    MobileAppConfigPatch,
    MobileCommandStatus,
    MobileDeviceStatus,
    SyncDriverModelRequest,
    SyncDriverModelResponse,
    DriverModelManifest,
)
from app.services.driver.project_classes import is_production_model
from app.services.mobile.config import get_mobile_config, patch_mobile_config
from app.services.mobile.driver_deploy import resolve_driver_artifact, sync_driver_model
from app.services.models.registry import assign_model_numbers

router = APIRouter(prefix="/mobile", tags=["mobile"])
logger = logging.getLogger(__name__)


def _device_meta(device: FleetDevice) -> dict:
    raw = device.extra_metadata if isinstance(device.extra_metadata, dict) else {}
    return raw


@router.get("/project/{project_id}/status", response_model=MobileCommandStatus)
async def mobile_command_status(project_id: UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    devices_result = await db.execute(select(FleetDevice).where(FleetDevice.project_id == project_id))
    devices = list(devices_result.scalars().all())
    online = sum(1 for d in devices if d.is_online)

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    violations_result = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.event_type == RoadEventType.TRAFFIC_VIOLATION,
            RoadEvent.created_at >= today_start,
        )
    )
    events_result = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.created_at >= today_start,
        )
    )

    artifact = await resolve_driver_artifact(db, project)
    mobile_cfg = get_mobile_config(project)
    deployment = mobile_cfg.get("deployment")

    return MobileCommandStatus(
        project_id=project_id,
        driver_model_artifact_id=project.driver_model_artifact_id,
        active_model_artifact_id=project.active_model_artifact_id,
        model_ready=bool(artifact),
        deployment=deployment if isinstance(deployment, dict) else None,
        mobile_config=mobile_cfg,
        devices_online=online,
        devices_total=len(devices),
        violations_today=int(violations_result.scalar() or 0),
        events_today=int(events_result.scalar() or 0),
    )


@router.get("/project/{project_id}/config", response_model=MobileAppConfig)
async def get_mobile_app_config(project_id: UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    cfg = get_mobile_config(project)
    return MobileAppConfig(**{k: cfg[k] for k in MobileAppConfig.model_fields if k in cfg})


@router.patch("/project/{project_id}/config", response_model=MobileAppConfig)
async def update_mobile_app_config(
    project_id: UUID,
    data: MobileAppConfigPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    updates = data.model_dump(exclude_none=True)
    merged = patch_mobile_config(project, updates)
    await db.flush()
    return MobileAppConfig(**{k: merged[k] for k in MobileAppConfig.model_fields if k in merged})


@router.post("/project/{project_id}/sync-model", response_model=SyncDriverModelResponse)
async def sync_model_to_mobile_app(
    project_id: UUID,
    body: SyncDriverModelRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        manifest = await sync_driver_model(
            db,
            project,
            body.model_artifact_id,
            promote_active=body.promote_as_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "sync-model failed project=%s artifact=%s",
            project_id,
            body.model_artifact_id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"فشل رفع الموديل للتطبيق: {exc}",
        ) from exc

    await db.commit()
    return SyncDriverModelResponse(
        status="synced",
        manifest=DriverModelManifest(
            artifact_id=UUID(manifest["artifact_id"]),
            model_name=manifest["model_name"],
            architecture=str(manifest.get("architecture") or "yolo11"),
            version=manifest["version"],
            sha256=manifest["sha256"],
            format=manifest["format"],
            image_size=manifest["image_size"],
            resize_mode=str(manifest.get("resize_mode") or "letterbox"),
            nc=manifest["nc"],
            classes=manifest["classes"],
            model_size_mb=manifest.get("model_size_mb"),
            model_bytes=manifest.get("model_bytes"),
            updated_at=manifest["updated_at"],
            download_url=f"/api/v1/driver/model/download",
        ),
    )


@router.get("/project/{project_id}/devices", response_model=list[MobileDeviceStatus])
async def list_mobile_devices(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetDevice).where(FleetDevice.project_id == project_id))
    devices = list(result.scalars().all())
    out: list[MobileDeviceStatus] = []
    for device in devices:
        meta = _device_meta(device)
        out.append(
            MobileDeviceStatus(
                id=device.id,
                device_id=device.device_id,
                vehicle_id=device.vehicle_id,
                gps_status=device.gps_status,
                camera_status=device.camera_status,
                is_online=device.is_online,
                latitude=device.latitude,
                longitude=device.longitude,
                last_communication=device.last_communication,
                app_version=meta.get("app_version"),
                model_version=meta.get("model_version"),
                model_sha256=meta.get("model_sha256"),
                last_sync_at=meta.get("last_sync_at"),
            )
        )
    return out


@router.get("/project/{project_id}/models")
async def list_mobile_deployable_models(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ModelArtifact).where(ModelArtifact.project_id == project_id).order_by(ModelArtifact.created_at.desc())
    )
    artifacts = list(result.scalars().all())
    numbers = assign_model_numbers(artifacts)
    project = await db.get(Project, project_id)
    driver_id = project.driver_model_artifact_id if project else None
    active_id = project.active_model_artifact_id if project else None

    return [
        {
            "id": str(a.id),
            "name": a.name,
            "architecture": a.architecture,
            "model_number": numbers.get(a.id),
            "lifecycle": a.lifecycle.value if hasattr(a.lifecycle, "value") else str(a.lifecycle),
            "is_production": is_production_model(a),
            "is_driver_deployed": str(a.id) == str(driver_id) if driver_id else False,
            "is_active": str(a.id) == str(active_id) if active_id else False,
            "map50_95": (a.metrics or {}).get("map50_95"),
            "classes": a.classes_used or [],
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in artifacts
        if is_production_model(a)
    ]


@router.get("/project/{project_id}/violations")
async def list_speed_violations(
    project_id: UUID,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoadEvent)
        .where(
            RoadEvent.project_id == project_id,
            RoadEvent.event_type == RoadEventType.TRAFFIC_VIOLATION,
        )
        .order_by(RoadEvent.created_at.desc())
        .limit(min(limit, 500))
    )
    events = list(result.scalars().all())
    return [
        {
            "id": str(e.id),
            "latitude": e.latitude,
            "longitude": e.longitude,
            "confidence": e.confidence,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "device_id": str(e.device_id) if e.device_id else None,
            "metadata": e.extra_metadata or {},
        }
        for e in events
    ]
