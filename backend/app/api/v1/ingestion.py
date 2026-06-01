import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, verify_user_password
from app.core.database import get_db
from app.core.minio_client import download_bytes, upload_bytes
from app.models import (
    ClassAuditLog,
    ClassLabel,
    FleetDevice,
    Image,
    ImageQualityScore,
    IngestionRecord,
    IngestionSourceConfig,
    IngestionSourceType,
    User,
)
from app.schemas import (
    ClassCreate,
    ClassMergeRequest,
    ClassResponse,
    ClassUpdate,
    DeleteResultResponse,
    FleetDeviceCreate,
    FleetDeviceRegisterResponse,
    FleetDeviceResponse,
    ImageResponse,
    IngestionUploadResponse,
    PasswordConfirmRequest,
    TelemetryRequest,
)
from app.services.deletion import delete_class_permanently as remove_class_permanently
from app.core.redis_client import get_redis
from workers.ingestion.tasks import process_image

router = APIRouter(tags=["ingestion", "classes", "fleet"])


@router.post("/ingest/upload", response_model=IngestionUploadResponse)
async def upload_images(
    project_id: UUID = Form(...),
    source_type: str = Form("manual_upload"),
    dataset_id: UUID | None = Form(None),
    class_id: UUID | None = Form(None),
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.datasets.dataset_images import ensure_default_dataset

    target_dataset_id = dataset_id
    if not target_dataset_id:
        default_ds = await ensure_default_dataset(db, project_id)
        target_dataset_id = default_ds.id

    if class_id:
        cls = await db.get(ClassLabel, class_id)
        if not cls or cls.project_id != project_id:
            raise HTTPException(status_code=400, detail="Invalid class for this project")

    results = []
    for file in files:
        content = await file.read()
        metadata: dict = {"dataset_id": str(target_dataset_id)}
        if class_id:
            metadata["class_id"] = str(class_id)

        record = IngestionRecord(
            project_id=project_id,
            source_type=IngestionSourceType(source_type),
            source_id=str(user.id),
            status="processing",
            extra_metadata=metadata,
        )
        db.add(record)
        await db.flush()

        minio_key = f"ingestion/temp/{record.id}"
        upload_bytes(minio_key, content, file.content_type or "image/jpeg")
        process_image.delay(str(record.id), minio_key=minio_key)
        results.append(record)

    return IngestionUploadResponse(record_id=results[-1].id if results else UUID(int=0), status="processing")


@router.post("/ingest/device", response_model=IngestionUploadResponse)
async def ingest_from_device(
    project_id: UUID = Form(...),
    file: UploadFile = File(...),
    x_device_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FleetDevice).where(FleetDevice.api_key == x_device_key))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=401, detail="Invalid device key")

    content = await file.read()
    record = IngestionRecord(
        project_id=project_id,
        source_type=IngestionSourceType.VEHICLE_DEVICE,
        source_id=device.device_id,
        status="processing",
    )
    db.add(record)
    await db.flush()
    minio_key = f"ingestion/temp/{record.id}"
    upload_bytes(minio_key, content, "image/jpeg")
    process_image.delay(str(record.id), minio_key=minio_key)
    return IngestionUploadResponse(record_id=record.id, status="processing")


@router.post("/ingest/mobile", response_model=IngestionUploadResponse)
async def ingest_from_mobile(
    project_id: UUID = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    record = IngestionRecord(
        project_id=project_id,
        source_type=IngestionSourceType.MOBILE_APP,
        source_id=str(user.id),
        status="processing",
    )
    db.add(record)
    await db.flush()
    minio_key = f"ingestion/temp/{record.id}"
    upload_bytes(minio_key, content, "image/jpeg")
    process_image.delay(str(record.id), minio_key=minio_key)
    return IngestionUploadResponse(record_id=record.id, status="processing")


@router.get("/ingestion/stats/{project_id}")
async def ingestion_stats(project_id: UUID, db: AsyncSession = Depends(get_db)):
    total = await db.execute(select(func.count(IngestionRecord.id)).where(IngestionRecord.project_id == project_id))
    completed = await db.execute(
        select(func.count(IngestionRecord.id)).where(
            IngestionRecord.project_id == project_id, IngestionRecord.status == "completed"
        )
    )
    images = await db.execute(select(func.count(Image.id)).where(Image.project_id == project_id))
    avg_quality = await db.execute(
        select(func.avg(ImageQualityScore.overall_score))
        .join(Image)
        .where(Image.project_id == project_id)
    )
    return {
        "total_ingestions": total.scalar() or 0,
        "completed": completed.scalar() or 0,
        "total_images": images.scalar() or 0,
        "avg_quality_score": round(float(avg_quality.scalar() or 0), 2),
    }


@router.get("/ingestion/images/{project_id}", response_model=list[ImageResponse])
async def list_images(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Image).where(Image.project_id == project_id).limit(100))
    images = result.scalars().all()
    responses = []
    for img in images:
        qs = await db.execute(select(ImageQualityScore).where(ImageQualityScore.image_id == img.id))
        score = qs.scalar_one_or_none()
        responses.append(
            ImageResponse(
                id=img.id,
                filename=img.filename,
                status=img.status.value,
                source_type=img.source_type.value,
                quality_score=score.overall_score if score else None,
                width=img.width,
                height=img.height,
                created_at=img.created_at,
            )
        )
    return responses


def _guess_content_type(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


@router.get("/ingestion/images/{image_id}/content")
async def get_image_content(
    image_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(Image, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        data = download_bytes(image.minio_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Image file not found") from exc
    return Response(content=data, media_type=_guess_content_type(image.filename))


@router.get("/projects/{project_id}/classes", response_model=list[ClassResponse])
async def list_classes(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClassLabel).where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
    )
    return list(result.scalars().all())


@router.post("/projects/{project_id}/classes", response_model=ClassResponse)
async def add_class(project_id: UUID, data: ClassCreate, db: AsyncSession = Depends(get_db)):
    cls = ClassLabel(project_id=project_id, name=data.name, color=data.color)
    db.add(cls)
    await db.flush()
    return cls


@router.patch("/projects/{project_id}/classes/{class_id}", response_model=ClassResponse)
async def update_class(
    project_id: UUID, class_id: UUID, data: ClassUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    cls = await db.get(ClassLabel, class_id)
    if data.name:
        old_name = cls.name
        cls.name = data.name
        db.add(ClassAuditLog(project_id=project_id, action="rename", details={"old": old_name, "new": data.name}, user_id=user.id))
    if data.color:
        cls.color = data.color
    return cls


@router.post("/projects/{project_id}/classes/merge")
async def merge_classes_endpoint(
    project_id: UUID, data: ClassMergeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from app.services.projects.service import merge_classes
    await merge_classes(db, project_id, data.source_class_ids, data.target_class_id, user.id)
    return {"status": "merged"}


@router.delete("/projects/{project_id}/classes/{class_id}", response_model=DeleteResultResponse)
async def delete_class_endpoint(
    project_id: UUID,
    class_id: UUID,
    data: PasswordConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await remove_class_permanently(db, project_id, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeleteResultResponse(
        deleted=result["deleted"],
        message=(
            f"Class '{result['class_name']}' deleted permanently "
            f"({result['annotations_removed']} annotation(s) removed)."
        ),
    )


@router.get("/fleet/{project_id}", response_model=list[FleetDeviceResponse])
async def list_fleet(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetDevice).where(FleetDevice.project_id == project_id))
    return list(result.scalars().all())


@router.post("/fleet/{project_id}", response_model=FleetDeviceRegisterResponse)
async def register_device(project_id: UUID, data: FleetDeviceCreate, db: AsyncSession = Depends(get_db)):
    api_key = secrets.token_urlsafe(32)
    device = FleetDevice(
        project_id=project_id,
        device_id=data.device_id,
        vehicle_id=data.vehicle_id,
        api_key=api_key,
    )
    db.add(device)
    await db.flush()
    return FleetDeviceRegisterResponse(
        id=device.id,
        device_id=device.device_id,
        vehicle_id=device.vehicle_id,
        gps_status=device.gps_status,
        camera_status=device.camera_status,
        is_online=device.is_online,
        latitude=device.latitude,
        longitude=device.longitude,
        last_communication=device.last_communication,
        api_key=api_key,
        project_id=project_id,
    )


@router.post("/fleet/{device_id}/telemetry")
async def device_telemetry(device_id: str, data: TelemetryRequest, db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    from app.models import DeviceTelemetry

    result = await db.execute(select(FleetDevice).where(FleetDevice.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

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

    redis = await get_redis()
    await redis.setex(f"fleet:online:{device_id}", 60, "1")
    return {"status": "ok"}
