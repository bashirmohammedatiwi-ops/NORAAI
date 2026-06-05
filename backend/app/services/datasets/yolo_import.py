"""Import pre-labeled YOLO datasets (images + .txt) into the platform."""

from __future__ import annotations

import hashlib
import re
import uuid
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Callable

import imagehash
from PIL import Image as PILImage
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.minio_client import upload_bytes
from app.models import (
    Annotation,
    AnnotationStatus,
    ClassLabel,
    Dataset,
    Image,
    ImageQualityScore,
    ImageStatus,
    IngestionSourceType,
)
from ml.quality.scorer import assess_image_quality
from app.services.datasets.dataset_images import append_images_to_dataset_sync

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
LABEL_DIR_NAMES = ("labels-yolo", "labels", "labels_yolo")
IMAGE_DIR_NAMES = ("images", "imgs", "image")


@dataclass
class YoloImportResult:
    imported: int = 0
    skipped: int = 0
    annotations: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)
    detected_class_ids: set[int] = field(default_factory=set)
    yolo_class_names: list[str] = field(default_factory=list)


def _stem(path: Path) -> str:
    return path.stem.lower()


def _is_yolo_label_content(text: str) -> bool:
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            return False
        try:
            int(parts[0])
            [float(x) for x in parts[1:]]
        except ValueError:
            return False
    return True


def _parse_yolo_lines(text: str) -> list[tuple[int, float, float, float, float]]:
    rows: list[tuple[int, float, float, float, float]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            continue
        cls_idx = int(parts[0])
        rows.append((cls_idx, float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])))
    return rows


def _read_data_yaml(root: Path) -> list[str]:
    for candidate in (root / "data.yaml", root / "dataset.yaml"):
        if not candidate.exists():
            continue
        try:
            text = candidate.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        bracket = re.search(r"names:\s*\[(.*?)\]", text, re.DOTALL)
        if bracket:
            return re.findall(r"['\"]([^'\"]+)['\"]", bracket.group(1))
        lines = text.splitlines()
        names: list[str] = []
        in_names = False
        for line in lines:
            if re.match(r"^\s*names\s*:", line):
                in_names = True
                inline = re.search(r"names:\s*\[(.*?)\]", line)
                if inline:
                    return re.findall(r"['\"]([^'\"]+)['\"]", inline.group(1))
                continue
            if in_names:
                m = re.match(r"\s*(\d+)\s*:\s*['\"]?([^'\"#\n]+)", line)
                if m:
                    names.append((int(m.group(1)), m.group(2).strip()))
                elif line.strip() and not line.startswith(" "):
                    break
        if names:
            names.sort(key=lambda x: x[0])
            return [n for _, n in names]
    return []


def _build_analysis_result(
    *,
    matched: int,
    labeled: int,
    raw_images: int,
    raw_labels: int,
    detected: set[int],
    yolo_names: list[str],
) -> dict:
    warning: str | None = None
    if raw_images == 0 and raw_labels > 0:
        warning = (
            "الأرشيف يحتوي ملفات تسمية فقط بدون صور. "
            "اضغط مجلد data بالكامل (images + labels-YOLO) وليس مجلد labels-YOLO وحده."
        )
    elif raw_images > 0 and matched == 0:
        warning = (
            "وُجدت صور لكن لا يوجد تطابق بأسماء ملفات التسمية. "
            "تأكد أن اسم الصورة وملف .txt متطابقان."
        )
    elif raw_labels == 0 and raw_images > 0:
        warning = "الأرشيف يحتوي صوراً بدون ملفات .txt للتسمية."
    elif raw_images > 0 and labeled < matched:
        warning = f"{matched - labeled} صورة بدون ملف تسمية مطابق (ستُستورد بدون صناديق)."

    return {
        "image_count": matched,
        "labeled_count": labeled,
        "raw_image_files": raw_images,
        "raw_label_files": raw_labels,
        "detected_class_ids": sorted(detected),
        "yolo_class_names": yolo_names,
        "warning": warning,
        "valid": matched > 0,
    }


def analyze_yolo_zip_from_path(zip_path: Path, *, max_label_samples: int = 400) -> dict:
    """Fast preview for large ZIPs — scans listing without full extract."""
    image_stems: set[str] = set()
    label_stems: set[str] = set()
    detected: set[int] = set()
    yolo_names: list[str] = []
    label_samples = 0

    with zipfile.ZipFile(zip_path) as zf:
        for raw_name in zf.namelist():
            if raw_name.endswith("/"):
                continue
            norm = raw_name.replace("\\", "/")
            lower = norm.lower()
            stem = Path(norm).stem.lower()
            ext = Path(norm).suffix.lower()
            if ext in IMAGE_EXTS:
                image_stems.add(stem)
            elif ext == ".txt" and "data.yaml" not in lower and "dataset.yaml" not in lower:
                label_stems.add(stem)
            if lower.endswith("data.yaml") or lower.endswith("dataset.yaml"):
                try:
                    with zf.open(raw_name) as f:
                        yolo_names = _read_data_yaml_from_text(f.read().decode("utf-8", errors="ignore"))
                except Exception:
                    pass

        for raw_name in zf.namelist():
            if label_samples >= max_label_samples:
                break
            lower = raw_name.lower()
            if not lower.endswith(".txt") or "data.yaml" in lower:
                continue
            try:
                with zf.open(raw_name) as f:
                    text = f.read(65536).decode("utf-8", errors="ignore")
            except Exception:
                continue
            if not _is_yolo_label_content(text):
                continue
            for row in _parse_yolo_lines(text):
                detected.add(row[0])
            label_samples += 1

    matched = len(image_stems)
    labeled = len(image_stems & label_stems)
    return _build_analysis_result(
        matched=matched,
        labeled=labeled,
        raw_images=len(image_stems),
        raw_labels=len(label_stems),
        detected=detected,
        yolo_names=yolo_names,
    )


def _read_data_yaml_from_text(text: str) -> list[str]:
    bracket = re.search(r"names:\s*\[(.*?)\]", text, re.DOTALL)
    if bracket:
        return re.findall(r"['\"]([^'\"]+)['\"]", bracket.group(1))
    return _read_data_yaml_from_path_content(text)


def _read_data_yaml_from_path_content(text: str) -> list[str]:
    lines = text.splitlines()
    names: list[tuple[int, str]] = []
    in_names = False
    for line in lines:
        if re.match(r"^\s*names\s*:", line):
            in_names = True
            inline = re.search(r"names:\s*\[(.*?)\]", line)
            if inline:
                return re.findall(r"['\"]([^'\"]+)['\"]", inline.group(1))
            continue
        if in_names:
            m = re.match(r"\s*(\d+)\s*:\s*['\"]?([^'\"#\n]+)", line)
            if m:
                names.append((int(m.group(1)), m.group(2).strip()))
            elif line.strip() and not line.startswith(" "):
                break
    if names:
        names.sort(key=lambda x: x[0])
        return [n for _, n in names]
    return []


def analyze_yolo_zip(zip_bytes: bytes) -> dict:
    """Preview archive from in-memory bytes (small files)."""
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        path = Path(tmp.name)
        path.write_bytes(zip_bytes)
    try:
        return analyze_yolo_zip_from_path(path)
    finally:
        path.unlink(missing_ok=True)


def _collect_files(root: Path) -> tuple[dict[str, Path], dict[str, Path]]:
    images: dict[str, Path] = {}
    labels: dict[str, Path] = {}

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext in IMAGE_EXTS:
            images[_stem(path)] = path
        elif ext == ".txt":
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if _is_yolo_label_content(content):
                labels[_stem(path)] = path
    return images, labels


def discover_pairs_from_zip(root: Path) -> tuple[list[tuple[Path, Path | None]], list[str]]:
    yolo_names = _read_data_yaml(root)
    images, labels = _collect_files(root)
    stems = sorted(set(images.keys()) | set(labels.keys()))
    pairs: list[tuple[Path, Path | None]] = []
    for stem in stems:
        img = images.get(stem)
        if img:
            pairs.append((img, labels.get(stem)))
    return pairs, yolo_names


def resolve_class_map_by_name(
    session: Session,
    project_id: uuid.UUID,
    mapping: dict[str, str],
) -> dict[int, uuid.UUID]:
    """Map YOLO class index (str key) -> ClassLabel id by class name."""
    classes = session.execute(
        select(ClassLabel).where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
    ).scalars().all()
    by_name = {c.name: c.id for c in classes}
    out: dict[int, uuid.UUID] = {}
    for key, name in mapping.items():
        if not name or name not in by_name:
            continue
        try:
            out[int(key)] = by_name[name]
        except ValueError:
            continue
    return out


def suggest_mapping_from_yolo_names(
    yolo_names: list[str],
    project_class_names: list[str],
) -> dict[str, str]:
    """Heuristic mapping e.g. Pothole -> حفر."""
    aliases: dict[str, str] = {
        "pothole": "حفر",
        "potholes": "حفر",
        "crack": "حفر",
        "cracks": "حفر",
        "manhole": "حفر",
        "حفرة": "حفر",
        "حفر": "حفر",
        "accident": "حوادث",
        "accidents": "حوادث",
        "حادث": "حوادث",
        "حوادث": "حوادث",
        "vehicle": "حوادث",
        "damage": "حوادث",
    }
    project_set = set(project_class_names)
    default = project_class_names[0] if project_class_names else ""
    suggested: dict[str, str] = {}
    for idx, raw in enumerate(yolo_names):
        key = raw.lower().strip()
        target = aliases.get(key, "")
        if target not in project_set:
            target = "حفر" if "حفر" in project_set else default
        suggested[str(idx)] = target
    return suggested


def import_yolo_pairs_sync(
    session: Session,
    *,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    pairs: list[tuple[Path, Path | None]],
    class_index_map: dict[int, uuid.UUID],
    progress_callback: Callable[[dict], None] | None = None,
) -> YoloImportResult:
    result = YoloImportResult()
    total = len(pairs)
    imported_ids: list[uuid.UUID] = []

    for i, (image_path, label_path) in enumerate(pairs, 1):
        try:
            image_bytes = image_path.read_bytes()
            content_hash = hashlib.sha256(image_bytes).hexdigest()

            existing = session.execute(
                select(Image).where(Image.project_id == project_id, Image.content_hash == content_hash)
            ).scalar_one_or_none()

            if existing:
                img = existing
                result.skipped += 1
                session.execute(
                    delete(Annotation).where(
                        Annotation.image_id == img.id,
                        Annotation.source == "yolo_import",
                    )
                )
            else:
                try:
                    pil = PILImage.open(BytesIO(image_bytes))
                    width, height = pil.size
                    phash = str(imagehash.phash(pil))
                except Exception:
                    result.failed += 1
                    result.errors.append(f"Corrupt image: {image_path.name}")
                    continue

                final_key = f"projects/{project_id}/images/{content_hash[:16]}.jpg"
                upload_bytes(final_key, image_bytes, "image/jpeg")
                quality = assess_image_quality(image_bytes)

                img = Image(
                    project_id=project_id,
                    filename=image_path.name,
                    minio_key=final_key,
                    content_hash=content_hash,
                    phash=phash,
                    width=width,
                    height=height,
                    status=ImageStatus.VALIDATED,
                    source_type=IngestionSourceType.MANUAL_UPLOAD,
                )
                session.add(img)
                session.flush()

                session.add(
                    ImageQualityScore(
                        image_id=img.id,
                        overall_score=quality["overall_score"],
                        blur_score=quality["blur_score"],
                        brightness_score=quality["brightness_score"],
                        resolution_score=quality["resolution_score"],
                        is_corrupted=quality["is_corrupted"],
                        details=quality.get("details", {}),
                    )
                )

            label_text = ""
            if label_path and label_path.exists():
                label_text = label_path.read_text(encoding="utf-8", errors="ignore")

            rows = _parse_yolo_lines(label_text)
            for cls_idx, xc, yc, w, h in rows:
                result.detected_class_ids.add(cls_idx)
                class_id = class_index_map.get(cls_idx)
                if not class_id:
                    continue
                session.add(
                    Annotation(
                        image_id=img.id,
                        class_id=class_id,
                        x_center=xc,
                        y_center=yc,
                        width=w,
                        height=h,
                        confidence=1.0,
                        status=AnnotationStatus.APPROVED,
                        source="yolo_import",
                    )
                )
                result.annotations += 1

            imported_ids.append(img.id)
            result.imported += 1

            if i % 25 == 0 or i == total:
                session.flush()
                if progress_callback:
                    progress_callback({
                        "phase": "import",
                        "current": i,
                        "total": total,
                        "imported": result.imported,
                        "annotations": result.annotations,
                        "progress": int((i / max(total, 1)) * 100),
                    })
        except Exception as exc:
            result.failed += 1
            if len(result.errors) < 20:
                result.errors.append(f"{image_path.name}: {exc}")

    if imported_ids:
        append_images_to_dataset_sync(session, dataset_id, imported_ids)

    session.commit()
    return result


def import_yolo_zip_sync(
    session: Session,
    *,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    class_mapping: dict[str, str],
    zip_bytes: bytes | None = None,
    zip_path: Path | None = None,
    progress_callback: Callable[[dict], None] | None = None,
) -> YoloImportResult:
    dataset = session.get(Dataset, dataset_id)
    if not dataset or dataset.project_id != project_id:
        raise ValueError("Dataset not found")

    class_index_map = resolve_class_map_by_name(session, project_id, class_mapping)
    if not class_index_map:
        raise ValueError("No valid class mapping. Map YOLO class IDs to project class names.")

    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        if zip_path:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(root)
        elif zip_bytes:
            with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
                zf.extractall(root)
        else:
            raise ValueError("No archive provided")

        pairs, yolo_names = discover_pairs_from_zip(root)
        if not pairs:
            raise ValueError("No image files found in archive")

        result = import_yolo_pairs_sync(
            session,
            project_id=project_id,
            dataset_id=dataset_id,
            pairs=pairs,
            class_index_map=class_index_map,
            progress_callback=progress_callback,
        )
        result.yolo_class_names = yolo_names
        return result
