"""Local JSON / file storage for classes, datasets, and models."""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import (
    ACTIVE_DATASET_FILE,
    CLASSES_FILE,
    DATASETS_DIR,
    MODELS_DIR,
)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_classes() -> list[dict]:
    return _read_json(CLASSES_FILE, [])


def save_classes(classes: list[dict]) -> list[dict]:
    _write_json(CLASSES_FILE, classes)
    return classes


def add_class(name: str, color: str = "#0f766e") -> dict:
    classes = list_classes()
    key = name.strip()
    if not key:
        raise ValueError("Class name required")
    if any(c["name"].lower() == key.lower() for c in classes):
        raise ValueError("Class already exists")
    entry = {
        "id": str(uuid.uuid4()),
        "name": key,
        "color": color,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    classes.append(entry)
    save_classes(classes)
    return entry


def delete_class(class_id: str) -> bool:
    classes = list_classes()
    filtered = [c for c in classes if c["id"] != class_id]
    if len(filtered) == len(classes):
        return False
    save_classes(filtered)
    return True


def get_active_dataset_id() -> str | None:
    data = _read_json(ACTIVE_DATASET_FILE, {})
    return data.get("dataset_id")


def set_active_dataset(dataset_id: str) -> None:
    _write_json(ACTIVE_DATASET_FILE, {"dataset_id": dataset_id})


def dataset_dir(dataset_id: str) -> Path:
    return DATASETS_DIR / dataset_id


def create_dataset(meta: dict) -> dict:
    dataset_id = str(uuid.uuid4())
    ddir = dataset_dir(dataset_id)
    ddir.mkdir(parents=True, exist_ok=True)
    record = {
        "id": dataset_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **meta,
    }
    _write_json(ddir / "meta.json", record)
    set_active_dataset(dataset_id)
    return record


def get_dataset(dataset_id: str) -> dict | None:
    meta_path = dataset_dir(dataset_id) / "meta.json"
    if not meta_path.exists():
        return None
    return _read_json(meta_path, None)


def list_datasets() -> list[dict]:
    out: list[dict] = []
    for p in DATASETS_DIR.iterdir():
        if not p.is_dir():
            continue
        meta = get_dataset(p.name)
        if meta:
            out.append(meta)
    return sorted(out, key=lambda x: x.get("created_at", ""), reverse=True)


def list_models() -> list[dict]:
    out: list[dict] = []
    for p in MODELS_DIR.iterdir():
        if not p.is_dir():
            continue
        meta_path = p / "meta.json"
        if meta_path.exists():
            out.append(_read_json(meta_path, {}))
    return sorted(out, key=lambda x: x.get("created_at", ""), reverse=True)


def model_dir(model_id: str) -> Path:
    return MODELS_DIR / model_id


def save_model_meta(meta: dict) -> dict:
    mid = meta["id"]
    mdir = model_dir(mid)
    mdir.mkdir(parents=True, exist_ok=True)
    _write_json(mdir / "meta.json", meta)
    return meta


def delete_dataset(dataset_id: str) -> bool:
    ddir = dataset_dir(dataset_id)
    if not ddir.exists():
        return False
    shutil.rmtree(ddir)
    if get_active_dataset_id() == dataset_id:
        _write_json(ACTIVE_DATASET_FILE, {})
    return True


def delete_all_datasets() -> int:
    """Remove every imported dataset and clear active selection."""
    count = 0
    if DATASETS_DIR.exists():
        for p in list(DATASETS_DIR.iterdir()):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
                count += 1
    _write_json(ACTIVE_DATASET_FILE, {})
    return count
