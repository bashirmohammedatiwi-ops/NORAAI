import json
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from sqlalchemy.exc import IntegrityError

from app.api.deps import get_current_user, verify_user_password
from app.core.database import get_db
from app.models import ClassLabel, Dataset, DatasetVersion, Image, ImageQualityScore, IngestionSourceType, User
from app.schemas import (
    AddImagesToDatasetRequest,
    DatasetBuilderStatsResponse,
    DatasetCreate,
    DatasetDiffResponse,
    DatasetGalleryResponse,
    DeleteResultResponse,
    DatasetSummaryResponse,
    PasswordConfirmRequest,
    DatasetUploadResponse,
    DatasetVersionCreate,
    ImageResponse,
    YoloImportPreviewResponse,
    YoloImportStartResponse,
    YoloImportStatusResponse,
    YoloUploadResponse,
)
from app.services.datasets.builder_stats import get_builder_stats
from app.services.datasets.dataset_images import (
    append_images_to_dataset,
    ensure_default_dataset,
    get_dataset_summary,
)
from app.services.datasets.list_datasets import (
    fetch_project_dataset_hub,
    list_project_datasets,
    list_project_datasets_with_stats,
)
from app.services.datasets.gallery import get_dataset_gallery
from app.services.deletion import delete_dataset_permanently
from app.services.datasets.versioning import compare_versions, create_dataset, create_version, rollback_dataset
from app.services.ingestion.batch_upload import FilePayload, ingest_files_parallel
from app.core.config import get_settings
from app.services.datasets.yolo_import import (
    analyze_yolo_zip,
    analyze_yolo_zip_from_path,
    suggest_mapping_from_yolo_names,
)
from app.core.minio_client import download_to_path, upload_bytes, upload_file_limited
from workers.celery_app import celery_app
from workers.ingestion.tasks import import_yolo_dataset

router = APIRouter(prefix="/datasets", tags=["datasets"])
logger = logging.getLogger(__name__)


@router.get("/project/{project_id}")
async def list_datasets(
    project_id: UUID,
    include_stats: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    if include_stats:
        return await list_project_datasets_with_stats(db, project_id)
    return await list_project_datasets(db, project_id)


@router.get("/project/{project_id}/hub")
async def project_dataset_hub(project_id: UUID, db: AsyncSession = Depends(get_db)):
    return await fetch_project_dataset_hub(db, project_id)


@router.post("/project/{project_id}/default", response_model=DatasetSummaryResponse)
async def get_or_create_default_dataset(project_id: UUID, db: AsyncSession = Depends(get_db)):
    dataset = await ensure_default_dataset(db, project_id)
    summary = await get_dataset_summary(db, dataset.id)
    return DatasetSummaryResponse(**summary)


@router.post("/project/{project_id}")
async def create_new_dataset(
    project_id: UUID, data: DatasetCreate, db: AsyncSession = Depends(get_db)
):
    dataset = await create_dataset(db, project_id, data.name, data.description)
    return {"id": str(dataset.id), "name": dataset.name}


@router.get("/{dataset_id}/summary", response_model=DatasetSummaryResponse)
async def dataset_summary(dataset_id: UUID, db: AsyncSession = Depends(get_db)):
    summary = await get_dataset_summary(db, dataset_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DatasetSummaryResponse(**summary)


@router.get("/{dataset_id}/gallery", response_model=DatasetGalleryResponse)
async def dataset_gallery(
    dataset_id: UUID,
    class_id: UUID | None = Query(None),
    unlabeled_only: bool = Query(False),
    healthy_only: bool = Query(False),
    limit: int = Query(48, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    gallery = await get_dataset_gallery(
        db,
        dataset_id,
        class_id=class_id,
        unlabeled_only=unlabeled_only,
        healthy_only=healthy_only,
        limit=limit,
        offset=offset,
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DatasetGalleryResponse(**gallery)


@router.get("/{dataset_id}/images", response_model=list[ImageResponse])
async def list_dataset_images(dataset_id: UUID, db: AsyncSession = Depends(get_db)):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or not dataset.head_version_id:
        return []

    version = await db.get(DatasetVersion, dataset.head_version_id)
    if not version:
        return []

    image_ids = version.manifest.get("image_ids", [])
    if not image_ids:
        return []

    uuids = [UUID(i) for i in image_ids]
    result = await db.execute(select(Image).where(Image.id.in_(uuids)).limit(200))
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


@router.post("/{dataset_id}/images")
async def add_images_to_dataset(
    dataset_id: UUID,
    data: AddImagesToDatasetRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    version = await append_images_to_dataset(db, dataset_id, data.image_ids)
    if not version:
        raise HTTPException(status_code=400, detail="Could not add images")

    return {
        "dataset_id": str(dataset_id),
        "version_id": str(version.id),
        "image_count": version.image_count,
    }


@router.get("/{dataset_id}/builder-stats", response_model=DatasetBuilderStatsResponse)
async def dataset_builder_stats(dataset_id: UUID, db: AsyncSession = Depends(get_db)):
    stats = await get_builder_stats(db, dataset_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DatasetBuilderStatsResponse(**stats)


@router.post("/{dataset_id}/upload", response_model=DatasetUploadResponse)
async def upload_to_dataset(
    dataset_id: UUID,
    files: list[UploadFile] = File(...),
    source_type: str = Form("manual_upload"),
    class_id: UUID | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if len(files) > 12:
        raise HTTPException(status_code=400, detail="Maximum 12 images per upload request. Upload in smaller batches.")

    if class_id:
        cls = await db.get(ClassLabel, class_id)
        if not cls or cls.project_id != dataset.project_id:
            raise HTTPException(status_code=400, detail="Invalid class for this project")

    payloads: list[FilePayload] = []
    for file in files:
        content = await file.read()
        payloads.append(FilePayload(content=content, content_type=file.content_type or "image/jpeg"))

    metadata: dict = {"dataset_id": str(dataset_id)}
    if class_id:
        metadata["class_id"] = str(class_id)

    record_ids = await ingest_files_parallel(
        db,
        project_id=dataset.project_id,
        source_type=IngestionSourceType(source_type),
        source_id=str(user.id),
        files=payloads,
        extra_metadata=metadata,
    )

    cls_note = ""
    if class_id:
        cls = await db.get(ClassLabel, class_id)
        cls_note = (
            f" — صنف '{cls.name}': بدون صندوق = صورة سليمة ضمن نفس الصنف"
            if cls
            else ""
        )

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        record_ids=record_ids,
        status="processing",
        class_id=class_id,
        message=f"Queued {len(record_ids)} image(s) for '{dataset.name}'{cls_note}",
    )


def _yolo_minio_key(upload_id: uuid.UUID) -> str:
    return f"imports/yolo/{upload_id}.zip"


def _yolo_max_bytes() -> int:
    return get_settings().yolo_import_max_bytes


def _yolo_max_gb_label() -> str:
    return f"{_yolo_max_bytes() // (1024 ** 3)}GB"


async def _analyze_yolo_from_upload_id(upload_id: str) -> dict:
    try:
        uid = uuid.UUID(upload_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid upload_id") from exc

    minio_key = _yolo_minio_key(uid)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        zip_path = Path(tmp.name)
    try:
        download_to_path(minio_key, zip_path)
        return analyze_yolo_zip_from_path(zip_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Archive not found or invalid: {exc}") from exc
    finally:
        zip_path.unlink(missing_ok=True)


@router.post("/{dataset_id}/import-yolo/upload", response_model=YoloUploadResponse)
async def upload_yolo_archive(
    dataset_id: UUID,
    archive: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    upload_id = uuid.uuid4()
    minio_key = _yolo_minio_key(upload_id)
    max_bytes = _yolo_max_bytes()

    try:
        await archive.seek(0)
        size = upload_file_limited(
            minio_key,
            archive.file,
            max_bytes,
            archive.content_type or "application/zip",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    return YoloUploadResponse(
        upload_id=str(upload_id),
        size_bytes=size,
        message=f"تم رفع الأرشيف ({size / (1024 * 1024):.1f} MB)",
    )


@router.post("/{dataset_id}/import-yolo/preview", response_model=YoloImportPreviewResponse)
async def preview_yolo_import(
    dataset_id: UUID,
    upload_id: str | None = Form(None),
    archive: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    max_bytes = _yolo_max_bytes()
    try:
        if upload_id:
            info = await _analyze_yolo_from_upload_id(upload_id)
        elif archive:
            content = await archive.read()
            if not content:
                raise HTTPException(status_code=400, detail="Empty archive")
            if len(content) > max_bytes:
                raise HTTPException(status_code=400, detail=f"Archive too large (max {_yolo_max_gb_label()})")
            info = analyze_yolo_zip(content)
        else:
            raise HTTPException(status_code=400, detail="Provide upload_id or archive")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid archive: {exc}") from exc

    classes = await db.execute(
        select(ClassLabel).where(ClassLabel.project_id == dataset.project_id, ClassLabel.is_archived == False)
    )
    project_names = [c.name for c in classes.scalars().all()]
    yolo_names = info.get("yolo_class_names") or []
    if not yolo_names and info.get("detected_class_ids"):
        yolo_names = [f"class_{i}" for i in info["detected_class_ids"]]

    suggested = suggest_mapping_from_yolo_names(yolo_names, project_names)
    if not suggested and info.get("detected_class_ids"):
        default = project_names[0] if project_names else "حفر"
        suggested = {str(i): default for i in info["detected_class_ids"]}

    return YoloImportPreviewResponse(
        image_count=info["image_count"],
        labeled_count=info["labeled_count"],
        raw_image_files=info.get("raw_image_files", 0),
        raw_label_files=info.get("raw_label_files", 0),
        detected_class_ids=info["detected_class_ids"],
        yolo_class_names=yolo_names,
        suggested_mapping=suggested,
        warning=info.get("warning"),
        valid=bool(info.get("valid", info["image_count"] > 0)),
    )


@router.post("/{dataset_id}/import-yolo", response_model=YoloImportStartResponse)
async def start_yolo_import(
    dataset_id: UUID,
    class_mapping: str = Form(...),
    train_after_import: bool = Form(False),
    upload_id: str | None = Form(None),
    archive: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        mapping = json.loads(class_mapping)
        if not isinstance(mapping, dict):
            raise ValueError("class_mapping must be a JSON object")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid class_mapping JSON: {exc}") from exc

    max_bytes = _yolo_max_bytes()
    try:
        if upload_id:
            check = await _analyze_yolo_from_upload_id(upload_id)
            minio_key = _yolo_minio_key(uuid.UUID(upload_id))
        elif archive:
            content = await archive.read()
            if not content:
                raise HTTPException(status_code=400, detail="Empty archive")
            if len(content) > max_bytes:
                raise HTTPException(status_code=400, detail=f"Archive too large (max {_yolo_max_gb_label()})")
            check = analyze_yolo_zip(content)
            import_id = uuid.uuid4()
            minio_key = _yolo_minio_key(import_id)
            upload_bytes(minio_key, content, archive.content_type or "application/zip")
        else:
            raise HTTPException(status_code=400, detail="Provide upload_id or archive")

        if not check.get("valid"):
            detail = check.get("warning") or "لا توجد صور مطابقة في الأرشيف"
            raise HTTPException(status_code=400, detail=detail)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid archive: {exc}") from exc

    try:
        task = import_yolo_dataset.delay(
            minio_key,
            str(dataset.project_id),
            str(dataset_id),
            mapping,
            str(user.id),
            train_after_import,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Import worker unavailable: {exc}") from exc

    msg = "جاري استيراد صور + تسميات YOLO"
    if train_after_import:
        msg += " ثم بدء التدريب تلقائياً"
    return YoloImportStartResponse(task_id=task.id, status="processing", message=msg)


@router.get("/import-yolo/{task_id}/status", response_model=YoloImportStatusResponse)
async def yolo_import_status(task_id: str, user: User = Depends(get_current_user)):
    del user
    result = AsyncResult(task_id, app=celery_app)
    state = result.state or "PENDING"
    meta = result.info if isinstance(result.info, dict) else {}
    payload = result.result if isinstance(result.result, dict) else None

    if state == "PROGRESS":
        return YoloImportStatusResponse(
            task_id=task_id,
            state=state,
            progress=int(meta.get("progress", 0)),
            imported=int(meta.get("imported", 0)),
            annotations=int(meta.get("annotations", 0)),
        )
    if state == "SUCCESS" and payload:
        return YoloImportStatusResponse(
            task_id=task_id,
            state="completed",
            progress=100,
            imported=int(payload.get("imported", 0)),
            annotations=int(payload.get("annotations", 0)),
            failed=int(payload.get("failed", 0)),
            training_job_id=payload.get("training_job_id"),
            result=payload,
        )
    if state == "FAILURE":
        err = str(result.result) if result.result else "Import failed"
        return YoloImportStatusResponse(task_id=task_id, state="failed", error=err)
    return YoloImportStatusResponse(task_id=task_id, state=state.lower())


@router.get("/{dataset_id}/versions")
async def list_versions(dataset_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id).order_by(DatasetVersion.created_at)
    )
    return [
        {
            "id": str(v.id),
            "version_tag": v.version_tag,
            "image_count": v.image_count,
            "created_at": v.created_at.isoformat(),
        }
        for v in result.scalars().all()
    ]


@router.post("/{dataset_id}/versions")
async def create_new_version(
    dataset_id: UUID,
    data: DatasetVersionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await create_version(
        db, dataset_id, data.version_tag, data.image_ids, data.branch_name, user.id
    )
    return {"id": str(version.id), "version_tag": version.version_tag, "image_count": version.image_count}


@router.get("/{dataset_id}/branches")
async def list_branches(dataset_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.models import DatasetBranch

    result = await db.execute(select(DatasetBranch).where(DatasetBranch.dataset_id == dataset_id))
    return [{"id": str(b.id), "name": b.name, "head_version_id": str(b.head_version_id) if b.head_version_id else None} for b in result.scalars().all()]


@router.post("/{dataset_id}/branches")
async def create_branch(dataset_id: UUID, name: str, db: AsyncSession = Depends(get_db)):
    from app.models import DatasetBranch

    branch = DatasetBranch(dataset_id=dataset_id, name=name)
    db.add(branch)
    await db.flush()
    return {"id": str(branch.id), "name": branch.name}


@router.get("/versions/compare", response_model=DatasetDiffResponse)
async def compare_dataset_versions(
    from_version_id: UUID, to_version_id: UUID, db: AsyncSession = Depends(get_db)
):
    diff = await compare_versions(db, from_version_id, to_version_id)
    return DatasetDiffResponse(**diff)


@router.post("/{dataset_id}/rollback/{version_id}")
async def rollback(dataset_id: UUID, version_id: UUID, db: AsyncSession = Depends(get_db)):
    await rollback_dataset(db, dataset_id, version_id)
    return {"status": "rolled_back", "head_version_id": str(version_id)}


@router.post("/{dataset_id}/merge")
async def merge_datasets(
    dataset_id: UUID,
    source_version_id: UUID,
    target_version_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    from_v = await db.get(DatasetVersion, source_version_id)
    to_v = await db.get(DatasetVersion, target_version_id)
    if not from_v or not to_v:
        raise HTTPException(status_code=404, detail="Version not found")

    merged_ids = list(set(from_v.manifest.get("image_ids", []) + to_v.manifest.get("image_ids", [])))
    version = await create_version(db, dataset_id, f"merge-{target_version_id}", [UUID(i) for i in merged_ids])
    return {"id": str(version.id), "image_count": version.image_count}


@router.delete("/{dataset_id}", response_model=DeleteResultResponse)
async def delete_dataset(
    dataset_id: UUID,
    data: PasswordConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    try:
        result = await delete_dataset_permanently(db, dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IntegrityError as exc:
        logger.exception("Failed to delete dataset %s due to database constraint", dataset_id)
        raise HTTPException(
            status_code=409,
            detail="Dataset could not be deleted because it is still referenced by other records.",
        ) from exc
    return DeleteResultResponse(
        deleted=result["deleted"],
        message=(
            f"Dataset '{result['dataset_name']}' deleted with {result['images_removed']} image(s) removed."
        ),
    )
