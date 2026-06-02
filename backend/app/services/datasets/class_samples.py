"""Per-class healthy (سليمة) samples when no manual/auto bbox exists."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus, ClassImageSample, ClassLabel, ClassSampleType

_ACTIVE = (
    AnnotationStatus.APPROVED,
    AnnotationStatus.EDITED,
    AnnotationStatus.PENDING_REVIEW,
)


def mark_negative_healthy_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
    *,
    source: str = "upload",
) -> ClassImageSample | None:
    """Register image as healthy (no defect) for this class."""
    if _has_class_annotation_sync(session, image_id, class_id):
        clear_negative_healthy_sync(session, image_id, class_id)
        return None

    existing = _get_sample_sync(session, image_id, class_id)
    if existing:
        existing.source = source
        return existing

    sample = ClassImageSample(
        image_id=image_id,
        class_id=class_id,
        sample_type=ClassSampleType.NEGATIVE_HEALTHY,
        source=source,
    )
    session.add(sample)
    session.flush()
    return sample


def clear_negative_healthy_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> None:
    session.execute(
        delete(ClassImageSample).where(
            ClassImageSample.image_id == image_id,
            ClassImageSample.class_id == class_id,
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    )


def sync_after_annotations_sync(session: Session, image_id: uuid.UUID) -> None:
    """If image has bbox for a class, remove healthy flag; else keep/restore per known samples."""
    for class_id in _annotated_class_ids_sync(session, image_id):
        clear_negative_healthy_sync(session, image_id, class_id)

    existing_samples = session.execute(
        select(ClassImageSample.class_id).where(ClassImageSample.image_id == image_id)
    ).all()
    for (class_id,) in existing_samples:
        if not _has_class_annotation_sync(session, image_id, class_id):
            continue
        clear_negative_healthy_sync(session, image_id, class_id)


def sync_class_after_annotation_change_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> None:
    if _has_class_annotation_sync(session, image_id, class_id):
        clear_negative_healthy_sync(session, image_id, class_id)
    else:
        mark_negative_healthy_sync(session, image_id, class_id, source="annotation_cleared")


def count_healthy_by_class_sync(
    session: Session,
    project_id: uuid.UUID,
    image_ids: list[uuid.UUID] | None = None,
) -> dict[str, int]:
    q = (
        select(ClassImageSample.class_id, func.count(ClassImageSample.id))
        .join(ClassLabel, ClassLabel.id == ClassImageSample.class_id)
        .where(
            ClassLabel.project_id == project_id,
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    )
    if image_ids:
        q = q.where(ClassImageSample.image_id.in_(image_ids))
    q = q.group_by(ClassImageSample.class_id)
    return {str(row[0]): int(row[1]) for row in session.execute(q).all()}


def samples_for_images_sync(
    session: Session,
    image_ids: list[uuid.UUID],
) -> dict[str, list[dict]]:
    if not image_ids:
        return {}
    rows = session.execute(
        select(ClassImageSample, ClassLabel)
        .join(ClassLabel, ClassLabel.id == ClassImageSample.class_id)
        .where(
            ClassImageSample.image_id.in_(image_ids),
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    ).all()
    out: dict[str, list[dict]] = {}
    for sample, cls in rows:
        key = str(sample.image_id)
        out.setdefault(key, []).append({
            "class_id": str(cls.id),
            "name": cls.name,
            "color": cls.color,
            "sample_type": sample.sample_type.value,
        })
    return out


def healthy_image_ids_for_class_sync(
    session: Session,
    class_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> set[str]:
    if not image_ids:
        return set()
    result = session.execute(
        select(ClassImageSample.image_id).where(
            ClassImageSample.class_id == class_id,
            ClassImageSample.image_id.in_(image_ids),
            ClassImageSample.sample_type == ClassSampleType.NEGATIVE_HEALTHY,
        )
    )
    return {str(row[0]) for row in result.all()}


def _get_sample_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> ClassImageSample | None:
    return session.execute(
        select(ClassImageSample).where(
            ClassImageSample.image_id == image_id,
            ClassImageSample.class_id == class_id,
        )
    ).scalar_one_or_none()


def _has_class_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> bool:
    row = session.execute(
        select(func.count(Annotation.id)).where(
            Annotation.image_id == image_id,
            Annotation.class_id == class_id,
            Annotation.status.in_(_ACTIVE),
        )
    ).scalar()
    return int(row or 0) > 0


def _annotated_class_ids_sync(session: Session, image_id: uuid.UUID) -> list[uuid.UUID]:
    result = session.execute(
        select(Annotation.class_id)
        .where(
            Annotation.image_id == image_id,
            Annotation.status.in_(_ACTIVE),
        )
        .distinct()
    )
    return [row[0] for row in result.all()]
