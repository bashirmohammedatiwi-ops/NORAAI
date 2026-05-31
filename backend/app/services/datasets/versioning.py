import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dataset, DatasetBranch, DatasetImage, DatasetVersion, DatasetVersionDiff


async def create_dataset(db: AsyncSession, project_id: uuid.UUID, name: str, description: str | None) -> Dataset:
    dataset = Dataset(project_id=project_id, name=name, description=description)
    db.add(dataset)
    await db.flush()

    branch = DatasetBranch(dataset_id=dataset.id, name="main")
    db.add(branch)
    await db.flush()
    return dataset


async def create_version(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    version_tag: str,
    image_ids: list[uuid.UUID],
    branch_name: str = "main",
    user_id: uuid.UUID | None = None,
) -> DatasetVersion:
    result = await db.execute(select(DatasetBranch).where(DatasetBranch.dataset_id == dataset_id, DatasetBranch.name == branch_name))
    branch = result.scalar_one_or_none()
    if not branch:
        branch = DatasetBranch(dataset_id=dataset_id, name=branch_name)
        db.add(branch)
        await db.flush()

    version = DatasetVersion(
        dataset_id=dataset_id,
        version_tag=version_tag,
        branch_id=branch.id,
        image_count=len(image_ids),
        manifest={"image_ids": [str(i) for i in image_ids]},
        created_by=user_id,
    )
    db.add(version)
    await db.flush()

    for img_id in image_ids:
        db.add(DatasetImage(version_id=version.id, image_id=img_id))

    branch.head_version_id = version.id
    dataset = await db.get(Dataset, dataset_id)
    if dataset:
        dataset.head_version_id = version.id

    await db.flush()
    return version


async def compare_versions(
    db: AsyncSession, from_version_id: uuid.UUID, to_version_id: uuid.UUID
) -> dict:
    from_v = await db.get(DatasetVersion, from_version_id)
    to_v = await db.get(DatasetVersion, to_version_id)
    if not from_v or not to_v:
        return {}

    from_ids = set(from_v.manifest.get("image_ids", []))
    to_ids = set(to_v.manifest.get("image_ids", []))

    diff = {
        "added_images": list(to_ids - from_ids),
        "removed_images": list(from_ids - to_ids),
        "added_classes": [],
        "removed_classes": [],
    }

    db.add(
        DatasetVersionDiff(
            dataset_id=from_v.dataset_id,
            from_version_id=from_version_id,
            to_version_id=to_version_id,
            diff_data=diff,
        )
    )
    return diff


async def rollback_dataset(db: AsyncSession, dataset_id: uuid.UUID, version_id: uuid.UUID) -> Dataset:
    dataset = await db.get(Dataset, dataset_id)
    if dataset:
        dataset.head_version_id = version_id
    return dataset
