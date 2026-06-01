"""Auto-annotation helpers for dataset builder uploads."""

import uuid

from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes
from app.models import Annotation, AnnotationStatus, ClassLabel, Image
from ml.detection.class_taxonomy import detection_mode, normalize_class_name
from ml.detection.vehicle_localizer import detect_vehicles_from_bytes, largest_vehicle

VEHICLE_CLASS_PRIORITY = ("Vehicle", "Car", "Truck", "Bus", "Motorcycle")


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


def create_region_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
    *,
    x_center: float,
    y_center: float,
    width: float,
    height: float,
    source: str,
    confidence: float = 0.9,
) -> Annotation:
    existing = (
        session.query(Annotation)
        .filter(
            Annotation.image_id == image_id,
            Annotation.class_id == class_id,
            Annotation.source == source,
        )
        .first()
    )
    fields = {
        "x_center": x_center,
        "y_center": y_center,
        "width": width,
        "height": height,
        "confidence": confidence,
        "status": AnnotationStatus.APPROVED,
        "source": source,
    }
    if existing:
        for key, val in fields.items():
            setattr(existing, key, val)
        return existing

    ann = Annotation(image_id=image_id, class_id=class_id, **fields)
    session.add(ann)
    session.flush()
    return ann


def resolve_vehicle_class_id(session: Session, project_id: uuid.UUID) -> uuid.UUID | None:
    for name in VEHICLE_CLASS_PRIORITY:
        cls = (
            session.query(ClassLabel)
            .filter(
                ClassLabel.project_id == project_id,
                ClassLabel.name == name,
                ClassLabel.is_archived == False,
            )
            .first()
        )
        if cls:
            return cls.id
    for cls in (
        session.query(ClassLabel)
        .filter(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
        .all()
    ):
        if detection_mode(cls.name) == "vehicle":
            return cls.id
    return None


def create_vehicle_class_annotation_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
    vehicle: dict,
) -> Annotation:
    """Label the detected vehicle region with the project class."""
    return create_region_annotation_sync(
        session,
        image_id,
        class_id,
        x_center=vehicle["x_center"],
        y_center=vehicle["y_center"],
        width=vehicle["width"],
        height=vehicle["height"],
        source="upload_vehicle_auto",
        confidence=float(vehicle.get("confidence", 1.0)),
    )


def road_defect_region(*, class_name: str) -> dict:
    """Default box on road surface (pothole/crack usually in lower half of frame)."""
    n = normalize_class_name(class_name)
    if "crack" in n:
        return {"x_center": 0.5, "y_center": 0.78, "width": 0.55, "height": 0.18, "confidence": 0.85}
    return {"x_center": 0.5, "y_center": 0.72, "width": 0.38, "height": 0.28, "confidence": 0.85}


def auto_annotate_class_on_image_sync(
    session: Session,
    image_id: uuid.UUID,
    class_id: uuid.UUID,
) -> Annotation | None:
    """
    Auto-label with localized boxes:
    - Road classes (Pothole, Road_Crack): box on road surface
    - Damage/Accident/Vehicle: COCO vehicle box only when a vehicle is detected
    - No full-image fallback for vehicle-related classes
    """
    cls = session.get(ClassLabel, class_id)
    class_name = cls.name if cls else ""
    mode = detection_mode(class_name)

    image = session.get(Image, image_id)
    vehicles: list[dict] = []
    if image and image.minio_key:
        try:
            img_bytes = download_bytes(image.minio_key)
            vehicles = detect_vehicles_from_bytes(img_bytes, conf=0.25)
        except Exception:
            vehicles = []

    vehicle = largest_vehicle(vehicles)

    if mode == "road":
        region = road_defect_region(class_name=class_name)
        return create_region_annotation_sync(
            session,
            image_id,
            class_id,
            source="upload_road_auto",
            **region,
        )

    if mode in ("damage", "vehicle"):
        if not vehicle:
            return None
        return create_vehicle_class_annotation_sync(session, image_id, class_id, vehicle)

    if vehicle:
        vehicle_class_id = resolve_vehicle_class_id(session, image.project_id) if image else None
        target_id = vehicle_class_id or class_id
        return create_vehicle_class_annotation_sync(session, image_id, target_id, vehicle)

    return None


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
