"""Optimized dataset listing — avoids N+1 queries per dataset."""

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dataset, DatasetVersion
from app.services.datasets.builder_stats import get_builder_stats


async def list_project_datasets(db: AsyncSession, project_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(Dataset)
        .where(Dataset.project_id == project_id)
        .order_by(Dataset.created_at)
    )
    datasets = list(result.scalars().all())
    if not datasets:
        return []

    version_ids = [d.head_version_id for d in datasets if d.head_version_id]
    versions: dict[uuid.UUID, DatasetVersion] = {}
    if version_ids:
        version_rows = await db.execute(
            select(DatasetVersion).where(DatasetVersion.id.in_(version_ids))
        )
        for version in version_rows.scalars().all():
            versions[version.id] = version

    summaries: list[dict] = []
    for dataset in datasets:
        version = versions.get(dataset.head_version_id) if dataset.head_version_id else None
        summaries.append({
            "id": str(dataset.id),
            "name": dataset.name,
            "description": dataset.description,
            "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
            "version_tag": version.version_tag if version else None,
            "image_count": version.image_count if version else 0,
        })
    return summaries


async def list_project_datasets_with_stats(db: AsyncSession, project_id: uuid.UUID) -> list[dict]:
    summaries = await list_project_datasets(db, project_id)
    if not summaries:
        return []

    stats_results = await asyncio.gather(
        *[get_builder_stats(db, uuid.UUID(item["id"])) for item in summaries]
    )
    enriched: list[dict] = []
    for summary, stats in zip(summaries, stats_results):
        row = dict(summary)
        if stats:
            row["builder_stats"] = stats
        enriched.append(row)
    return enriched


async def fetch_project_dataset_hub(db: AsyncSession, project_id: uuid.UUID) -> dict:
    from app.services.datasets.dataset_images import ensure_default_dataset

    datasets = await list_project_datasets(db, project_id)
    if not datasets:
        await ensure_default_dataset(db, project_id)
        datasets = await list_project_datasets(db, project_id)

    default_id = datasets[0]["id"] if datasets else None
    default_stats = None
    if default_id:
        default_stats = await get_builder_stats(db, uuid.UUID(default_id))

    return {
        "datasets": datasets,
        "default_dataset_id": default_id,
        "default_stats": default_stats,
    }
