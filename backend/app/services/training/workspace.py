"""Fast ephemeral workspace for YOLO export/train (RAM disk on Hostinger VPS)."""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path


def _ram_workspace_bases() -> list[Path]:
    return [
        Path("/tmp/training/workspaces"),
        Path("/dev/shm/aiops_train"),
    ]


def _writable_base(path: Path) -> Path | None:
    try:
        path.mkdir(parents=True, exist_ok=True)
        test = path / f".write_test_{uuid.uuid4().hex}"
        test.write_text("ok", encoding="utf-8")
        test.unlink(missing_ok=True)
        return path
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
        base = None
        for candidate in _ram_workspace_bases():
            base = _writable_base(candidate)
            if base is not None:
                break
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
