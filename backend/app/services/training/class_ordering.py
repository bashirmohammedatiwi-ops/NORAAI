"""Stable YOLO class index ordering — must match between export, training, and inference."""

from __future__ import annotations

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus, ClassLabel


def load_project_classes(session: Session, project_id: uuid.UUID) -> list[ClassLabel]:
    result = session.execute(
        select(ClassLabel)
        .where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
        .order_by(ClassLabel.created_at, ClassLabel.name)
    )
    return list(result.scalars().all())


def normalize_class_id_list(class_ids: list[str] | list[uuid.UUID] | None) -> list[str] | None:
    if not class_ids:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for raw in class_ids:
        key = str(raw).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out or None


def apply_selected_classes(
    classes: list[ClassLabel],
    selected_class_ids: list[str] | None,
    *,
    project_classes: list[ClassLabel] | None = None,
) -> list[ClassLabel]:
    """Keep only user-selected classes in the requested order."""
    if not selected_class_ids:
        return classes
    selected = normalize_class_id_list(selected_class_ids) or []
    lookup = {str(c.id): c for c in (project_classes or classes)}
    return [lookup[cid] for cid in selected if cid in lookup]


def load_classes_for_export(
    session: Session,
    project_id: uuid.UUID,
    image_ids: list[uuid.UUID],
    version_manifest: dict | None = None,
    selected_class_ids: list[str] | None = None,
) -> list[ClassLabel]:
    """
    Export only classes present in annotations, ordered by original YOLO index when known.
    Reduces nc and keeps class IDs aligned with imported YOLO datasets.
    """
    all_classes = load_project_classes(session, project_id)
    by_id = {str(c.id): c for c in all_classes}
    if not image_ids:
        return apply_selected_classes(all_classes, selected_class_ids, project_classes=all_classes)

    used_ids: set[str] = set()
    rows = session.execute(
        select(Annotation.class_id).where(
            Annotation.image_id.in_(image_ids),
            Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
        )
    )
    for (class_id,) in rows.all():
        used_ids.add(str(class_id))

    used = [by_id[cid] for cid in used_ids if cid in by_id]
    if not used:
        return apply_selected_classes(all_classes, selected_class_ids, project_classes=all_classes)

    manifest = version_manifest or {}
    yolo_indices: dict[str, int] = manifest.get("yolo_indices") or {}
    if yolo_indices:
        used.sort(key=lambda c: (int(yolo_indices.get(str(c.id), 9999)), c.name))
        return apply_selected_classes(used, selected_class_ids, project_classes=all_classes)

    counts = annotation_class_counts(session, image_ids, class_id_to_index(all_classes))
    full_index = class_id_to_index(all_classes)
    used.sort(
        key=lambda c: (
            -counts.get(full_index.get(str(c.id), 0), 0),
            c.created_at,
            c.name,
        )
    )
    return apply_selected_classes(used, selected_class_ids, project_classes=all_classes)


def build_class_manifest(classes: list[ClassLabel], version_manifest: dict | None = None) -> dict:
    names = [c.name for c in classes]
    manifest = {
        "names": names,
        "class_ids": [str(c.id) for c in classes],
        "nc": max(len(names), 1),
    }
    if version_manifest:
        yolo_indices = version_manifest.get("yolo_indices")
        if yolo_indices:
            manifest["yolo_indices"] = {
                str(cid): int(idx) for cid, idx in yolo_indices.items() if str(cid) in manifest["class_ids"]
            }
    return manifest


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
