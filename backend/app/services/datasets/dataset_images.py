"""Add images to datasets (sync for workers, async for API)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import Dataset, DatasetBranch, DatasetImage, DatasetVersion
from app.services.datasets.versioning import create_dataset


def append_images_to_dataset_sync(
    session: Session,
    dataset_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> DatasetVersion | None:
    if not image_ids:
        return None

    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        return None

    if not dataset.head_version_id:
        branch = session.query(DatasetBranch).filter_by(dataset_id=dataset_id, name="main").first()
        if not branch:
            branch = DatasetBranch(dataset_id=dataset_id, name="main")
            session.add(branch)
            session.flush()

        version = DatasetVersion(
            dataset_id=dataset_id,
            version_tag="v1",
            branch_id=branch.id,
            image_count=0,
            manifest={"image_ids": []},
        )
        session.add(version)
        session.flush()
        branch.head_version_id = version.id
        dataset.head_version_id = version.id
        session.flush()

    version = session.get(DatasetVersion, dataset.head_version_id)
    if not version:
        return None

    current_ids = list(version.manifest.get("image_ids", []))
    current_set = set(current_ids)

    for img_id in image_ids:
        sid = str(img_id)
        if sid in current_set:
            continue
        current_set.add(sid)
        current_ids.append(sid)
        session.add(DatasetImage(version_id=version.id, image_id=img_id))

    version.manifest = {"image_ids": current_ids}
    version.image_count = len(current_ids)
    session.flush()
    return version


async def append_images_to_dataset(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> DatasetVersion | None:
    if not image_ids:
        return None

    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None

    if not dataset.head_version_id:
        branch_result = await db.execute(
            select(DatasetBranch).where(DatasetBranch.dataset_id == dataset_id, DatasetBranch.name == "main")
        )
        branch = branch_result.scalar_one_or_none()
        if not branch:
            branch = DatasetBranch(dataset_id=dataset_id, name="main")
            db.add(branch)
            await db.flush()

        version = DatasetVersion(
            dataset_id=dataset_id,
            version_tag="v1",
            branch_id=branch.id,
            image_count=0,
            manifest={"image_ids": []},
        )
        db.add(version)
        await db.flush()
        branch.head_version_id = version.id
        dataset.head_version_id = version.id
        await db.flush()

    version = await db.get(DatasetVersion, dataset.head_version_id)
    if not version:
        return None

    current_ids = list(version.manifest.get("image_ids", []))
    current_set = set(current_ids)

    for img_id in image_ids:
        sid = str(img_id)
        if sid in current_set:
            continue
        current_set.add(sid)
        current_ids.append(sid)
        db.add(DatasetImage(version_id=version.id, image_id=img_id))

    version.manifest = {"image_ids": current_ids}
    version.image_count = len(current_ids)
    await db.flush()
    return version


async def ensure_default_dataset(db: AsyncSession, project_id: uuid.UUID) -> Dataset:
    result = await db.execute(
        select(Dataset).where(Dataset.project_id == project_id).order_by(Dataset.created_at).limit(1)
    )
    dataset = result.scalar_one_or_none()
    if dataset:
        return dataset
    return await create_dataset(db, project_id, "Default Dataset", "Uploaded images for training")


async def get_dataset_summary(db: AsyncSession, dataset_id: uuid.UUID) -> dict | None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None

    version_tag = None
    image_count = 0
    if dataset.head_version_id:
        version = await db.get(DatasetVersion, dataset.head_version_id)
        if version:
            version_tag = version.version_tag
            image_count = version.image_count

    return {
        "id": str(dataset.id),
        "name": dataset.name,
        "description": dataset.description,
        "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
        "version_tag": version_tag,
        "image_count": image_count,
    }
