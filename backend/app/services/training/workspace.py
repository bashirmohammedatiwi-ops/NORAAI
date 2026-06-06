"""Fast ephemeral workspace for YOLO export/train (RAM disk on Hostinger VPS)."""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path


def _shm_base() -> Path | None:
    shm = Path("/dev/shm")
    if not shm.is_dir():
        return None
    try:
        base = shm / "aiops_train"
        base.mkdir(parents=True, exist_ok=True)
        test = base / f".write_test_{uuid.uuid4().hex}"
        test.write_text("ok", encoding="utf-8")
        test.unlink(missing_ok=True)
        return base
    except OSError:
        return None


def use_ram_workspace() -> bool:
    from app.core.config import get_settings

    s = get_settings()
    return bool(s.training_speed_boost or s.training_hostinger_mode)


@contextmanager
def fast_training_workspace(job_id: str):
    """Use /dev/shm when available (critical on Hostinger KVM — avoids slow disk I/O)."""
    path: Path | None = None
    if use_ram_workspace():
        base = _shm_base()
        if base is not None:
            path = base / str(job_id)
            if path.exists():
                shutil.rmtree(path, ignore_errors=True)
            path.mkdir(parents=True, exist_ok=True)

    if path is None:
        with tempfile.TemporaryDirectory(prefix="aiops_train_") as tmp:
            yield tmp
        return

    try:
        yield str(path)
    finally:
        shutil.rmtree(path, ignore_errors=True)
