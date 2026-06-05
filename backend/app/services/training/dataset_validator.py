"""Pre-training dataset checks — catch label/class issues before low mAP."""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus, DatasetImage, DatasetVersion, Image
from app.services.training.class_ordering import (
    annotation_class_counts,
    build_class_manifest,
    class_id_to_index,
    load_project_classes,
)

MIN_IMAGES_RECOMMENDED = 50
MIN_ANNOTATIONS_PER_CLASS = 10


def validate_dataset_version(
    session: Session,
    dataset_version_id: uuid.UUID,
) -> dict:
    version = session.get(DatasetVersion, dataset_version_id)
    if not version:
        raise ValueError("Dataset version not found")

    image_ids = [uuid.UUID(i) for i in version.manifest.get("image_ids", [])]
    if not image_ids:
        result = session.execute(
            select(DatasetImage.image_id).where(DatasetImage.version_id == dataset_version_id)
        )
        image_ids = [row[0] for row in result.all()]

    project_id = version.dataset.project_id
    classes = load_project_classes(session, project_id)
    manifest = build_class_manifest(classes)
    class_index = class_id_to_index(classes)

    ann_rows = session.execute(
        select(Annotation).where(
            Annotation.image_id.in_(image_ids) if image_ids else False,
            Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
        )
    ) if image_ids else None

    ann_by_image: dict[uuid.UUID, list] = defaultdict(list)
    unknown_class_ids: set[str] = set()
    if ann_rows:
        for ann in ann_rows.scalars().all():
            ann_by_image[ann.image_id].append(ann)
            if str(ann.class_id) not in class_index:
                unknown_class_ids.add(str(ann.class_id))

    labeled_images = sum(1 for img_id in image_ids if ann_by_image.get(img_id))
    empty_label_images = len(image_ids) - labeled_images
    class_counts = annotation_class_counts(session, image_ids, class_index)

    errors: list[str] = []
    warnings: list[str] = []

    if not image_ids:
        errors.append("Dataset has no images.")
    if labeled_images == 0:
        errors.append("No approved annotations — train after labeling or importing YOLO labels.")
    if unknown_class_ids:
        errors.append(
            f"{len(unknown_class_ids)} annotation(s) reference deleted or archived classes."
        )

    if len(image_ids) < MIN_IMAGES_RECOMMENDED:
        warnings.append(
            f"Only {len(image_ids)} images — aim for {MIN_IMAGES_RECOMMENDED}+ for reliable mAP."
        )

    for idx, name in enumerate(manifest["names"]):
        count = class_counts.get(idx, 0)
        if count == 0:
            warnings.append(f"Class '{name}' (index {idx}) has zero annotations — may hurt training.")
        elif count < MIN_ANNOTATIONS_PER_CLASS:
            warnings.append(
                f"Class '{name}' has only {count} boxes — recommend {MIN_ANNOTATIONS_PER_CLASS}+."
            )

    if empty_label_images > 0:
        warnings.append(
            f"{empty_label_images} image(s) have no labels (OK as negatives if intentional)."
        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "image_count": len(image_ids),
            "labeled_images": labeled_images,
            "empty_label_images": empty_label_images,
            "class_counts": {manifest["names"][i]: class_counts.get(i, 0) for i in range(len(manifest["names"]))},
            "class_manifest": manifest,
        },
    }


def stratified_val_ids(
    image_ids: list[uuid.UUID],
    ann_by_image: dict[uuid.UUID, list],
    class_index: dict[str, int],
    val_split: float,
) -> set[uuid.UUID]:
    """Keep at least one val image per class bucket when possible."""
    import random

    buckets: dict[frozenset[int], list[uuid.UUID]] = defaultdict(list)
    for img_id in image_ids:
        present = frozenset(
            class_index[str(a.class_id)]
            for a in ann_by_image.get(img_id, [])
            if str(a.class_id) in class_index
        )
        buckets[present].append(img_id)

    val_ids: set[uuid.UUID] = set()
    for _key, ids in buckets.items():
        shuffled = list(ids)
        random.shuffle(shuffled)
        if len(shuffled) <= 2:
            val_ids.add(shuffled[-1])
            continue
        n = max(1, int(len(shuffled) * val_split))
        val_ids.update(shuffled[:n])

    if not val_ids and image_ids:
        val_ids.add(image_ids[0])
    return val_ids
