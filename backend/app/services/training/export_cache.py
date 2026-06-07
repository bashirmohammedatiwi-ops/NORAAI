"""Persistent YOLO export cache on RAM disk — skip MinIO re-download on repeat training."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
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
    try:
        now = time.time()
        os.utime(src, (now, now))
    except OSError:
        pass
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
    _refresh_data_yaml_path(output_dir)
    for split in ("train", "val"):
        img_dir = base / "images" / split
        if not img_dir.is_dir() or not any(img_dir.iterdir()):
            shutil.rmtree(base, ignore_errors=True)
            return False
    return True


def _refresh_data_yaml_path(output_dir: str) -> None:
    """Point data.yaml at the current workspace (cache copies retain stale absolute paths)."""
    yaml_path = Path(output_dir) / "data.yaml"
    if not yaml_path.is_file():
        return
    root = Path(output_dir).resolve()
    lines: list[str] = []
    path_updated = False
    for line in yaml_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("path:"):
            lines.append(f"path: {root}")
            path_updated = True
        else:
            lines.append(line)
    if not path_updated:
        lines.insert(0, f"path: {root}")
    yaml_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _evict_old_entries(root: Path, keep: int = 2) -> None:
    """Keep only the most-recent `keep` cache entries to bound RAM-disk usage."""
    try:
        entries = [p for p in root.iterdir() if p.is_dir()]
    except OSError:
        return
    if len(entries) <= keep:
        return
    entries.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for stale in entries[keep:]:
        shutil.rmtree(stale, ignore_errors=True)


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
    try:
        shutil.copytree(src, dest)
    except OSError:
        shutil.rmtree(dest, ignore_errors=True)
        return
    _evict_old_entries(root, keep=2)
