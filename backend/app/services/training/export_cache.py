"""Persistent YOLO export cache on RAM disk — skip MinIO re-download on repeat training."""

from __future__ import annotations

import hashlib
import json
import shutil
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Annotation, AnnotationStatus, DatasetVersion


def _cache_roots() -> list[Path]:
    return [
        Path("/dev/shm/aiops_export_cache"),
        Path("/tmp/training/export_cache"),
    ]


def cache_root() -> Path | None:
    from app.core.config import get_settings

    if not get_settings().training_export_cache_enabled:
        return None
    for root in _cache_roots():
        try:
            root.mkdir(parents=True, exist_ok=True)
            probe = root / f".probe_{uuid.uuid4().hex}"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return root
        except OSError:
            continue
    return None


def export_fingerprint(
    session: Session,
    version: DatasetVersion,
    image_ids: list[uuid.UUID],
    selected_class_ids: list[str] | None,
    val_split: float,
) -> str:
    ann_count = 0
    if image_ids:
        ann_count = int(
            session.scalar(
                select(func.count())
                .select_from(Annotation)
                .where(
                    Annotation.image_id.in_(image_ids),
                    Annotation.status.in_([AnnotationStatus.APPROVED, AnnotationStatus.EDITED]),
                )
            )
            or 0
        )
    payload = {
        "version_id": str(version.id),
        "image_count": len(image_ids),
        "ann_count": ann_count,
        "classes": sorted(selected_class_ids or []),
        "val_split": round(float(val_split), 3),
        "manifest": version.class_manifest or {},
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:24]
    return f"{version.id}_{digest}"


def try_restore_export(output_dir: str, fingerprint: str) -> bool:
    root = cache_root()
    if root is None:
        return False
    src = root / fingerprint
    if not (src / "data.yaml").is_file():
        return False
    base = Path(output_dir)
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)
    base.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        dest = base / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest)
    return True


def save_export_cache(output_dir: str, fingerprint: str) -> None:
    root = cache_root()
    if root is None:
        return
    src = Path(output_dir)
    if not (src / "data.yaml").is_file():
        return
    dest = root / fingerprint
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(src, dest)
