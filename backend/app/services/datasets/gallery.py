"""Dataset gallery: images with class labels and annotations."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Annotation,
    AnnotationStatus,
    ClassImageSample,
    ClassLabel,
    ClassSampleType,
    Dataset,
    DatasetImage,
    DatasetVersion,
    Image,
    ImageQualityScore,
)

ACTIVE_STATUSES = (
    AnnotationStatus.APPROVED,
    AnnotationStatus.EDITED,
    AnnotationStatus.PENDING_REVIEW,
)


async def _dataset_image_ids(db: AsyncSession, dataset: Dataset) -> list[uuid.UUID]:
    if not dataset.head_version_id:
        return []

    result = await db.execute(
        select(DatasetImage.image_id)
        .where(DatasetImage.version_id == dataset.head_version_id)
        .order_by(DatasetImage.added_at)
    )
    ids = [row[0] for row in result.all()]
    if ids:
        return ids

    version = await db.get(DatasetVersion, dataset.head_version_id)
    if not version:
        return []

    raw_ids = version.manifest.get("image_ids", [])
    return [uuid.UUID(i) for i in raw_ids]


async def _per_class_image_counts(
    db: AsyncSession, project_id: uuid.UUID, image_ids: list[uuid.UUID]
) -> tuple[list[dict], int]:
    if not image_ids:
        classes_result = await db.execute(
            select(ClassLabel).where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
        )
        return [
            {
                "class_id": str(c.id),
                "name": c.name,
                "color": c.color,
                "image_count": 0,
                "annotation_count": 0,
                "healthy_count": 0,
            }
            for c in classes_result.scalars().all()
        ], 0

    ann_result = await db.execute(
        select(
            Annotation.class_id,
            func.count(func.distinct(Annotation.image_id)),
            func.count(Annotation.id),
        )
        .where(
            Annotation.image_id.in_(image_ids),
            Annotation.status.in_(ACTIVE_STATUSES),
        )
        .group_by(Annotation.class_id)
    )
    class_image_counts = {str(row[0]): row[1] for row in ann_result.all()}
    class_ann_counts = {str(row[0]): row[2] for row in ann_result.all()}

    healthy_result = await db.execute(
        select(ClassImageSample.class_id, func.count(func.distinct(ClassImageSample.image_id)))
        .where(
            ClassImageSample.image_id.in_(image_ids),
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
        .group_by(ClassImageSample.class_id)
    )
    class_healthy_counts = {str(row[0]): row[1] for row in healthy_result.all()}

    annotated_images = await db.execute(
        select(func.count(func.distinct(Annotation.image_id))).where(
            Annotation.image_id.in_(image_ids),
            Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
        )
    )
    annotated_total = annotated_images.scalar() or 0

    classes_result = await db.execute(
        select(ClassLabel).where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
    )
    per_class = []
    for cls in classes_result.scalars().all():
        cid = str(cls.id)
        per_class.append(
            {
                "class_id": cid,
                "name": cls.name,
                "color": cls.color,
                "image_count": class_image_counts.get(cid, 0),
                "annotation_count": class_ann_counts.get(cid, 0),
                "healthy_count": class_healthy_counts.get(cid, 0),
            }
        )
    healthy_images_result = await db.execute(
        select(func.count(func.distinct(ClassImageSample.image_id))).where(
            ClassImageSample.image_id.in_(image_ids),
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    )
    healthy_total = healthy_images_result.scalar() or 0
    unlabeled_count = max(0, len(image_ids) - annotated_total - healthy_total)
    return per_class, unlabeled_count


async def get_dataset_gallery(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    class_id: uuid.UUID | None = None,
    unlabeled_only: bool = False,
    healthy_only: bool = False,
    limit: int = 48,
    offset: int = 0,
) -> dict | None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None

    all_ids = await _dataset_image_ids(db, dataset)
    per_class, unlabeled_count = await _per_class_image_counts(db, dataset.project_id, all_ids)

    filtered_ids = all_ids
    if class_id or unlabeled_only or healthy_only:
        ann_result = await db.execute(
            select(Annotation.image_id, Annotation.class_id, Annotation.status).where(
                Annotation.image_id.in_(all_ids),
                Annotation.status.in_(ACTIVE_STATUSES),
            )
        )
        by_image: dict[str, set[str]] = {}
        approved_images: set[str] = set()
        for img_id, cls_id, status in ann_result.all():
            key = str(img_id)
            by_image.setdefault(key, set()).add(str(cls_id))
            if status in (AnnotationStatus.APPROVED, AnnotationStatus.EDITED):
                approved_images.add(key)

        healthy_by_image: set[str] = set()
        if class_id or healthy_only:
            hq = select(ClassImageSample.image_id).where(
                ClassImageSample.image_id.in_(all_ids),
                ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
            )
            if class_id:
                hq = hq.where(ClassImageSample.class_id == class_id)
            hres = await db.execute(hq)
            healthy_by_image = {str(row[0]) for row in hres.all()}

        if healthy_only and class_id:
            filtered_ids = [i for i in all_ids if str(i) in healthy_by_image]
        elif healthy_only:
            hres = await db.execute(
                select(ClassImageSample.image_id).where(
                    ClassImageSample.image_id.in_(all_ids),
                    ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
                )
            )
            healthy_set = {str(row[0]) for row in hres.all()}
            filtered_ids = [i for i in all_ids if str(i) in healthy_set]
        elif unlabeled_only:
            hres = await db.execute(
                select(ClassImageSample.image_id).where(
                    ClassImageSample.image_id.in_(all_ids),
                    ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
                )
            )
            any_healthy = {str(row[0]) for row in hres.all()}
            filtered_ids = [
                i for i in all_ids
                if str(i) not in approved_images and str(i) not in any_healthy
            ]
        elif class_id:
            cid = str(class_id)
            filtered_ids = [
                i for i in all_ids
                if cid in by_image.get(str(i), set()) or str(i) in healthy_by_image
            ]

    total = len(filtered_ids)
    page_ids = filtered_ids[offset : offset + limit]
    if not page_ids:
        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "description": dataset.description,
            "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
            "total": total,
            "limit": limit,
            "offset": offset,
            "class_filter": str(class_id) if class_id else None,
            "unlabeled_only": unlabeled_only,
            "healthy_only": healthy_only,
            "unlabeled_count": unlabeled_count,
            "per_class": per_class,
            "items": [],
        }

    images_result = await db.execute(select(Image).where(Image.id.in_(page_ids)))
    images_by_id = {img.id: img for img in images_result.scalars().all()}

    scores_result = await db.execute(
        select(ImageQualityScore).where(ImageQualityScore.image_id.in_(page_ids))
    )
    scores_by_id = {s.image_id: s for s in scores_result.scalars().all()}

    ann_result = await db.execute(
        select(Annotation)
        .options(selectinload(Annotation.class_label))
        .where(
            Annotation.image_id.in_(page_ids),
            Annotation.status.in_(ACTIVE_STATUSES),
        )
    )
    anns_by_image: dict[uuid.UUID, list] = {}
    for ann in ann_result.scalars().all():
        anns_by_image.setdefault(ann.image_id, []).append(ann)

    sample_rows = await db.execute(
        select(ClassImageSample, ClassLabel)
        .join(ClassLabel, ClassLabel.id == ClassImageSample.class_id)
        .where(
            ClassImageSample.image_id.in_(page_ids),
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    )
    healthy_map: dict[uuid.UUID, list[dict]] = {}
    for sample, cls in sample_rows.all():
        healthy_map.setdefault(sample.image_id, []).append({
            "class_id": str(cls.id),
            "name": cls.name,
            "color": cls.color,
        })

    items = []
    for img_id in page_ids:
        img = images_by_id.get(img_id)
        if not img:
            continue
        score = scores_by_id.get(img_id)
        anns = anns_by_image.get(img_id, [])
        classes_map: dict[str, dict] = {}
        annotations = []
        for ann in anns:
            cls = ann.class_label
            if cls and str(cls.id) not in classes_map:
                classes_map[str(cls.id)] = {
                    "class_id": str(cls.id),
                    "name": cls.name,
                    "color": cls.color,
                }
            annotations.append(
                {
                    "id": str(ann.id),
                    "class_id": str(ann.class_id),
                    "class_name": cls.name if cls else "unknown",
                    "class_color": cls.color if cls else "#888",
                    "x_center": ann.x_center,
                    "y_center": ann.y_center,
                    "width": ann.width,
                    "height": ann.height,
                    "confidence": ann.confidence,
                    "status": ann.status.value,
                    "source": ann.source,
                }
            )

        healthy_list = healthy_map.get(img_id, [])
        items.append(
            {
                "id": str(img.id),
                "filename": img.filename,
                "status": img.status.value,
                "source_type": img.source_type.value,
                "quality_score": score.overall_score if score else None,
                "width": img.width,
                "height": img.height,
                "created_at": img.created_at,
                "classes": list(classes_map.values()),
                "annotations": annotations,
                "healthy_classes": healthy_list,
                "is_healthy": len(healthy_list) > 0 and not any(
                    a.status in (AnnotationStatus.APPROVED, AnnotationStatus.EDITED) for a in anns
                ),
                "is_annotated": any(
                    a.status in (AnnotationStatus.APPROVED, AnnotationStatus.EDITED) for a in anns
                ),
            }
        )

    return {
        "dataset_id": str(dataset.id),
        "dataset_name": dataset.name,
        "description": dataset.description,
        "head_version_id": str(dataset.head_version_id) if dataset.head_version_id else None,
        "total": total,
        "limit": limit,
        "offset": offset,
        "class_filter": str(class_id) if class_id else None,
        "unlabeled_only": unlabeled_only,
        "unlabeled_count": unlabeled_count,
        "per_class": per_class,
        "items": items,
    }
