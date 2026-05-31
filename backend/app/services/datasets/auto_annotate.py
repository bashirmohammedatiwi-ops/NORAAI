"""Auto-annotation helpers for dataset builder uploads."""

import uuid

from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus


def create_full_image_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> Annotation:
    """Create an approved YOLO bbox covering the full image (for single-object uploads)."""
    existing = (
        session.query(Annotation)
        .filter(
            Annotation.image_id == image_id,
            Annotation.class_id == class_id,
            Annotation.source == "upload_auto",
        )
        .first()
    )
    if existing:
        existing.status = AnnotationStatus.APPROVED
        existing.x_center = 0.5
        existing.y_center = 0.5
        existing.width = 1.0
        existing.height = 1.0
        return existing

    ann = Annotation(
        image_id=image_id,
        class_id=class_id,
        x_center=0.5,
        y_center=0.5,
        width=1.0,
        height=1.0,
        confidence=1.0,
        status=AnnotationStatus.APPROVED,
        source="upload_auto",
    )
    session.add(ann)
    session.flush()
    return ann


def link_image_to_dataset_and_class_sync(
    session: Session,
    image_id: uuid.UUID,
    dataset_id: uuid.UUID | None,
    class_id: uuid.UUID | None,
) -> None:
    from app.services.datasets.dataset_images import append_images_to_dataset_sync

    if dataset_id:
        append_images_to_dataset_sync(session, dataset_id, [image_id])
    if class_id:
        create_full_image_annotation_sync(session, image_id, class_id)
