from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Dataset, DatasetBranch, DatasetVersion, User
from app.schemas import DatasetCreate, DatasetDiffResponse, DatasetVersionCreate
from app.services.datasets.versioning import compare_versions, create_dataset, create_version, rollback_dataset

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/project/{project_id}")
async def list_datasets(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Dataset).where(Dataset.project_id == project_id))
    datasets = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "description": d.description,
            "head_version_id": str(d.head_version_id) if d.head_version_id else None,
        }
        for d in datasets
    ]


@router.post("/project/{project_id}")
async def create_new_dataset(
    project_id: UUID, data: DatasetCreate, db: AsyncSession = Depends(get_db)
):
    dataset = await create_dataset(db, project_id, data.name, data.description)
    return {"id": str(dataset.id), "name": dataset.name}


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
    result = await db.execute(select(DatasetBranch).where(DatasetBranch.dataset_id == dataset_id))
    return [{"id": str(b.id), "name": b.name, "head_version_id": str(b.head_version_id) if b.head_version_id else None} for b in result.scalars().all()]


@router.post("/{dataset_id}/branches")
async def create_branch(dataset_id: UUID, name: str, db: AsyncSession = Depends(get_db)):
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
