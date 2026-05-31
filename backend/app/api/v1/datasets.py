from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.minio_client import upload_bytes
from app.models import ClassLabel, Dataset, DatasetVersion, Image, ImageQualityScore, IngestionRecord, IngestionSourceType, User
from app.schemas import (
    AddImagesToDatasetRequest,
    DatasetBuilderStatsResponse,
    DatasetCreate,
    DatasetDiffResponse,
    DatasetSummaryResponse,
    DatasetUploadResponse,
    DatasetVersionCreate,
    ImageResponse,
)
from app.services.datasets.builder_stats import get_builder_stats
from app.services.datasets.dataset_images import (
    append_images_to_dataset,
    ensure_default_dataset,
    get_dataset_summary,
)
from app.services.datasets.versioning import compare_versions, create_dataset, create_version, rollback_dataset
from workers.ingestion.tasks import process_image

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/project/{project_id}")
async def list_datasets(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Dataset).where(Dataset.project_id == project_id))
    datasets = result.scalars().all()
    summaries = []
    for d in datasets:
        summary = await get_dataset_summary(db, d.id)
        summaries.append(summary or {"id": str(d.id), "name": d.name, "image_count": 0})
    return summaries


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

    if class_id:
        cls = await db.get(ClassLabel, class_id)
        if not cls or cls.project_id != dataset.project_id:
            raise HTTPException(status_code=400, detail="Invalid class for this project")

    record_ids = []
    for file in files:
        content = await file.read()
        metadata: dict = {"dataset_id": str(dataset_id)}
        if class_id:
            metadata["class_id"] = str(class_id)

        record = IngestionRecord(
            project_id=dataset.project_id,
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
        record_ids.append(record.id)

    cls_note = ""
    if class_id:
        cls = await db.get(ClassLabel, class_id)
        cls_note = f" with auto-label '{cls.name}'" if cls else ""

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        record_ids=record_ids,
        status="processing",
        class_id=class_id,
        message=f"Uploading {len(record_ids)} image(s) to '{dataset.name}'{cls_note}",
    )


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
