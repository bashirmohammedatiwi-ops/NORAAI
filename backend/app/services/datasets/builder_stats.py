"""Dataset builder statistics."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Annotation, AnnotationStatus, ClassLabel, Dataset, DatasetImage, DatasetVersion, Image


async def get_builder_stats(db: AsyncSession, dataset_id: uuid.UUID) -> dict | None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None

    image_count = 0
    annotated_count = 0
    image_ids: list[str] = []

    if dataset.head_version_id:
        version = await db.get(DatasetVersion, dataset.head_version_id)
        if version:
            image_count = version.image_count
            image_ids = list(version.manifest.get("image_ids", []))

    if not image_ids and dataset.head_version_id:
        result = await db.execute(
            select(DatasetImage.image_id).where(DatasetImage.version_id == dataset.head_version_id)
        )
        image_ids = [str(row[0]) for row in result.all()]
        image_count = len(image_ids)

    per_class: list[dict] = []
    if image_ids:
        uuids = [uuid.UUID(i) for i in image_ids]
        ann_result = await db.execute(
            select(Annotation.class_id, func.count(Annotation.id))
            .where(
                Annotation.image_id.in_(uuids),
                Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
            )
            .group_by(Annotation.class_id)
        )
        class_counts = {str(row[0]): row[1] for row in ann_result.all()}

        classes_result = await db.execute(
            select(ClassLabel).where(
                ClassLabel.project_id == dataset.project_id,
                ClassLabel.is_archived == False,
            )
        )
        for cls in classes_result.scalars().all():
            count = class_counts.get(str(cls.id), 0)
            if count:
                per_class.append({"class_id": str(cls.id), "name": cls.name, "color": cls.color, "count": count})

        img_with_ann = await db.execute(
            select(func.count(func.distinct(Annotation.image_id))).where(
                Annotation.image_id.in_(uuids),
                Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
            )
        )
        annotated_count = img_with_ann.scalar() or 0

    return {
        "dataset_id": str(dataset.id),
        "dataset_name": dataset.name,
        "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
        "image_count": image_count,
        "annotated_count": annotated_count,
        "ready_for_training": image_count > 0 and annotated_count > 0,
        "per_class": per_class,
    }
