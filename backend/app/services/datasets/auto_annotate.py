"""Auto-annotation helpers for dataset builder uploads."""

import uuid

from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes
from app.models import Annotation, AnnotationStatus, Image
from ml.detection.vehicle_localizer import detect_vehicles_from_bytes, largest_vehicle


def create_full_image_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> Annotation:
    """Fallback bbox covering the full image."""
    existing = (
        session.query(Annotation)
        .filter(
            Annotation.image_id == image_id,
            Annotation.class_id == class_id,
            Annotation.source.in_(("upload_auto", "upload_auto_fallback")),
        )
        .first()
    )
    if existing:
        existing.status = AnnotationStatus.APPROVED
        existing.x_center = 0.5
        existing.y_center = 0.5
        existing.width = 1.0
        existing.height = 1.0
        existing.source = "upload_auto_fallback"
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
        source="upload_auto_fallback",
    )
    session.add(ann)
    session.flush()
    return ann


def create_vehicle_class_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
    vehicle: dict,
) -> Annotation:
    """Label the detected vehicle region with the project class."""
    existing = (
        session.query(Annotation)
        .filter(
            Annotation.image_id == image_id,
            Annotation.class_id == class_id,
            Annotation.source == "upload_vehicle_auto",
        )
        .first()
    )
    fields = {
        "x_center": vehicle["x_center"],
        "y_center": vehicle["y_center"],
        "width": vehicle["width"],
        "height": vehicle["height"],
        "confidence": vehicle.get("confidence", 1.0),
        "status": AnnotationStatus.APPROVED,
        "source": "upload_vehicle_auto",
    }
    if existing:
        for key, val in fields.items():
            setattr(existing, key, val)
        return existing

    ann = Annotation(image_id=image_id, class_id=class_id, **fields)
    session.add(ann)
    session.flush()
    return ann


def auto_annotate_class_on_image_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> Annotation:
    """
    Step 1: detect vehicle location.
    Step 2: assign the selected class to that region (not the full image).
    """
    image = session.get(Image, image_id)
    if not image or not image.minio_key:
        return create_full_image_annotation_sync(session, image_id, class_id)

    try:
        img_bytes = download_bytes(image.minio_key)
        vehicles = detect_vehicles_from_bytes(img_bytes)
        vehicle = largest_vehicle(vehicles)
        if vehicle:
            return create_vehicle_class_annotation_sync(session, image_id, class_id, vehicle)
    except Exception:
        pass

    return create_full_image_annotation_sync(session, image_id, class_id)


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
        auto_annotate_class_on_image_sync(session, image_id, class_id)
