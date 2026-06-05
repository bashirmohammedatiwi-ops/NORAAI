"""Stable YOLO class index ordering — must match between export, training, and inference."""

from __future__ import annotations

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus, ClassLabel


def load_project_classes(session: Session, project_id: uuid.UUID) -> list[ClassLabel]:
    """Order by creation time (stable) then name — matches typical YOLO import order."""
    result = session.execute(
        select(ClassLabel)
        .where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
        .order_by(ClassLabel.created_at, ClassLabel.name)
    )
    return list(result.scalars().all())


def build_class_manifest(classes: list[ClassLabel]) -> dict:
    names = [c.name for c in classes]
    return {
        "names": names,
        "class_ids": [str(c.id) for c in classes],
        "nc": max(len(names), 1),
    }


def class_id_to_index(classes: list[ClassLabel]) -> dict[str, int]:
    return {str(c.id): idx for idx, c in enumerate(classes)}


def annotation_class_counts(
    session: Session,
    image_ids: list[uuid.UUID],
    class_index: dict[str, int],
) -> Counter[int]:
    counts: Counter[int] = Counter()
    if not image_ids:
        return counts
    rows = session.execute(
        select(Annotation).where(
            Annotation.image_id.in_(image_ids),
            Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
        )
    )
    for ann in rows.scalars().all():
        idx = class_index.get(str(ann.class_id))
        if idx is not None:
            counts[idx] += 1
    return counts
