import random
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes
from app.models import Annotation, AnnotationStatus, ClassLabel, DatasetImage, DatasetVersion, Image


def export_yolo_dataset_sync(
    session: Session,
    dataset_version_id: uuid.UUID,
    output_dir: str,
    val_split: float = 0.2,
) -> tuple[str, list[str]]:
    """Export dataset version to YOLO format. Returns (yaml_path, class_names)."""
    version = session.get(DatasetVersion, dataset_version_id)
    if not version:
        raise ValueError("Dataset version not found")

    image_ids = [UUID(i) for i in version.manifest.get("image_ids", [])]
    if not image_ids:
        result = session.execute(
            select(DatasetImage.image_id).where(DatasetImage.version_id == dataset_version_id)
        )
        image_ids = [row[0] for row in result.all()]

    dataset = version.dataset
    classes_result = session.execute(
        select(ClassLabel)
        .where(ClassLabel.project_id == dataset.project_id, ClassLabel.is_archived == False)
        .order_by(ClassLabel.name)
    )
    classes = list(classes_result.scalars().all())
    class_names = [c.name for c in classes]
    class_map = {str(c.id): idx for idx, c in enumerate(classes)}

    base = Path(output_dir)
    for split in ("train", "val"):
        (base / "images" / split).mkdir(parents=True, exist_ok=True)
        (base / "labels" / split).mkdir(parents=True, exist_ok=True)

    shuffled = list(image_ids)
    random.shuffle(shuffled)
    val_count = max(1, int(len(shuffled) * val_split)) if shuffled else 0
    val_ids = set(shuffled[:val_count])

    exported = 0
    for img_id in image_ids:
        image = session.get(Image, img_id)
        if not image:
            continue

        split = "val" if img_id in val_ids else "train"
        try:
            img_bytes = download_bytes(image.minio_key)
        except Exception:
            continue

        img_name = f"{img_id}.jpg"
        (base / "images" / split / img_name).write_bytes(img_bytes)

        ann_result = session.execute(
            select(Annotation).where(
                Annotation.image_id == img_id,
                Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
            )
        )
        labels = []
        for ann in ann_result.scalars().all():
            cls_idx = class_map.get(str(ann.class_id), 0)
            labels.append(f"{cls_idx} {ann.x_center:.6f} {ann.y_center:.6f} {ann.width:.6f} {ann.height:.6f}")

        (base / "labels" / split / f"{img_id}.txt").write_text("\n".join(labels))
        exported += 1

    if exported == 0:
        _write_placeholder_dataset(base)

    nc = max(len(class_names), 1)
    names = class_names if class_names else ["object"]
    yaml_content = f"path: {output_dir}\ntrain: images/train\nval: images/val\nnc: {nc}\nnames: {names}\n"
    yaml_path = str(base / "data.yaml")
    Path(yaml_path).write_text(yaml_content)
    return yaml_path, names


def _write_placeholder_dataset(base: Path) -> None:
    minimal_jpeg = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0x37, 0xFF, 0xD9,
    ])
    for split in ("train", "val"):
        (base / "images" / split / "placeholder.jpg").write_bytes(minimal_jpeg)
        (base / "labels" / split / "placeholder.txt").write_text("0 0.5 0.5 0.2 0.2")
