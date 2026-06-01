"""Add images to datasets (sync for workers, async for API)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import Dataset, DatasetBranch, DatasetImage, DatasetVersion
from app.services.datasets.versioning import create_dataset


def _image_ids_from_version_rows(session: Session, version_id: uuid.UUID) -> list[str]:
    rows = (
        session.query(DatasetImage.image_id)
        .filter(DatasetImage.version_id == version_id)
        .order_by(DatasetImage.added_at)
        .all()
    )
    return [str(row[0]) for row in rows]


async def _image_ids_from_version_rows_async(db: AsyncSession, version_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(DatasetImage.image_id)
        .where(DatasetImage.version_id == version_id)
        .order_by(DatasetImage.added_at)
    )
    return [str(row[0]) for row in result.all()]


def _sync_version_manifest(session: Session, version: DatasetVersion) -> None:
    image_ids = _image_ids_from_version_rows(session, version.id)
    version.manifest = {"image_ids": image_ids}
    version.image_count = len(image_ids)
    session.flush()


async def _sync_version_manifest_async(db: AsyncSession, version: DatasetVersion) -> None:
    image_ids = await _image_ids_from_version_rows_async(db, version.id)
    version.manifest = {"image_ids": image_ids}
    version.image_count = len(image_ids)
    await db.flush()


def _ensure_head_version_sync(session: Session, dataset: Dataset) -> DatasetVersion | None:
    if dataset.head_version_id:
        return session.execute(
            select(DatasetVersion)
            .where(DatasetVersion.id == dataset.head_version_id)
            .with_for_update()
        ).scalar_one_or_none()

    branch = session.query(DatasetBranch).filter_by(dataset_id=dataset.id, name="main").first()
    if not branch:
        branch = DatasetBranch(dataset_id=dataset.id, name="main")
        session.add(branch)
        session.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
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
    return version


async def _ensure_head_version_async(db: AsyncSession, dataset: Dataset) -> DatasetVersion | None:
    if dataset.head_version_id:
        result = await db.execute(
            select(DatasetVersion)
            .where(DatasetVersion.id == dataset.head_version_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    branch_result = await db.execute(
        select(DatasetBranch).where(DatasetBranch.dataset_id == dataset.id, DatasetBranch.name == "main")
    )
    branch = branch_result.scalar_one_or_none()
    if not branch:
        branch = DatasetBranch(dataset_id=dataset.id, name="main")
        db.add(branch)
        await db.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
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
    return version


def append_images_to_dataset_sync(
    session: Session,
    dataset_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> DatasetVersion | None:
    if not image_ids:
        return None

    dataset = session.execute(
        select(Dataset).where(Dataset.id == dataset_id).with_for_update()
    ).scalar_one_or_none()
    if not dataset:
        return None

    version = _ensure_head_version_sync(session, dataset)
    if not version:
        return None

    existing_rows = (
        session.query(DatasetImage.image_id)
        .filter(DatasetImage.version_id == version.id)
        .all()
    )
    current_set = {str(row[0]) for row in existing_rows}

    added = False
    for img_id in image_ids:
        sid = str(img_id)
        if sid in current_set:
            continue
        current_set.add(sid)
        session.add(DatasetImage(version_id=version.id, image_id=img_id))
        added = True

    if added:
        _sync_version_manifest(session, version)
    return version


async def append_images_to_dataset(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> DatasetVersion | None:
    if not image_ids:
        return None

    dataset_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id).with_for_update()
    )
    dataset = dataset_result.scalar_one_or_none()
    if not dataset:
        return None

    version = await _ensure_head_version_async(db, dataset)
    if not version:
        return None

    existing_result = await db.execute(
        select(DatasetImage.image_id).where(DatasetImage.version_id == version.id)
    )
    current_set = {str(row[0]) for row in existing_result.all()}

    added = False
    for img_id in image_ids:
        sid = str(img_id)
        if sid in current_set:
            continue
        current_set.add(sid)
        db.add(DatasetImage(version_id=version.id, image_id=img_id))
        added = True

    if added:
        await _sync_version_manifest_async(db, version)
    return version


async def repair_dataset_manifest(db: AsyncSession, dataset_id: uuid.UUID) -> int | None:
    """Rebuild manifest from dataset_images rows (fixes partial parallel uploads)."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or not dataset.head_version_id:
        return None

    version = await db.get(DatasetVersion, dataset.head_version_id)
    if not version:
        return None

    image_ids = await _image_ids_from_version_rows_async(db, version.id)
    version.manifest = {"image_ids": image_ids}
    version.image_count = len(image_ids)
    await db.flush()
    return len(image_ids)


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
            if version.image_count and version.image_count > 0:
                image_count = version.image_count
            else:
                from sqlalchemy import func
                from app.models import DatasetImage

                image_count = (
                    await db.execute(
                        select(func.count(DatasetImage.id)).where(
                            DatasetImage.version_id == dataset.head_version_id
                        )
                    )
                ).scalar() or 0
                if version.image_count != image_count:
                    version.image_count = image_count
                    await db.flush()

    return {
        "id": str(dataset.id),
        "name": dataset.name,
        "description": dataset.description,
        "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
        "version_tag": version_tag,
        "image_count": image_count,
    }
