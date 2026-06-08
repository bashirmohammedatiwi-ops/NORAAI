#!/usr/bin/env python3
"""
Incremental / continual YOLO11 training.

Loads the same model.pt, fine-tunes on new data, backs up, then overwrites model.pt.
Session 1: base_weights (e.g. yolo11n.pt) → model.pt
Session 2+: model.pt → backup → train → model.pt (same path)
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "train_config.yaml"


def load_config(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_config(path: Path, config: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, sort_keys=False, allow_unicode=True)


def resolve_path(base: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (base / p).resolve()


def load_dataset_yaml(data_path: Path) -> dict[str, Any]:
    with data_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    names = data.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names, key=lambda x: int(x) if str(x).isdigit() else x)]
    if not isinstance(names, list) or not names:
        raise ValueError(f"Dataset yaml must define names: {data_path}")
    return data


def merge_classes(existing: list[str], new_names: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for name in [*existing, *new_names]:
        key = str(name).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(key)
    return merged


def backup_model(model_path: Path, backup_dir: Path) -> Path | None:
    if not model_path.is_file():
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"{model_path.stem}_{stamp}{model_path.suffix}"
    shutil.copy2(model_path, dest)
    return dest


def find_best_weights(run_dir: Path) -> Path:
    candidates = [
        run_dir / "weights" / "best.pt",
        run_dir / "weights" / "last.pt",
    ]
    for path in candidates:
        if path.is_file() and path.stat().st_size > 100_000:
            return path
    raise FileNotFoundError(f"No valid best.pt found under {run_dir}")


def write_cumulative_data_yaml(
    source_data: Path,
    classes: list[str],
    work_dir: Path,
) -> Path:
    """Build a training yaml with cumulative class names (for multi-session class expansion)."""
    raw = load_dataset_yaml(source_data)
    out = dict(raw)
    out["names"] = classes
    out["nc"] = len(classes)
    dest = work_dir / "cumulative_data.yaml"
    with dest.open("w", encoding="utf-8") as f:
        yaml.safe_dump(out, f, sort_keys=False, allow_unicode=True)
    return dest


def train_incremental(
    new_data: str | Path,
    epochs: int,
    *,
    freeze_layers: int | None = None,
    config_path: str | Path = DEFAULT_CONFIG,
    session_note: str = "",
) -> dict[str, Any]:
    """
    Run one incremental training session.

    Args:
        new_data: Path to YOLO dataset yaml for this session.
        epochs: Number of training epochs.
        freeze_layers: Override freeze layers (0 for first session, default 10 after).
        config_path: Path to train_config.yaml.
        session_note: Optional description stored in session history.

    Returns:
        Dict with session summary and metrics.
    """
    config_path = Path(config_path).resolve()
    config = load_config(config_path)
    root = config_path.parent

    model_path = resolve_path(root, config.get("model_path", "models/model.pt"))
    backup_dir = resolve_path(root, config.get("backup_dir", "models/backups"))
    metadata_path = resolve_path(root, config.get("metadata_path", "models/model_meta.json"))
    data_path = Path(new_data).resolve()
    if not data_path.is_file():
        raise FileNotFoundError(f"Dataset yaml not found: {data_path}")

    dataset_info = load_dataset_yaml(data_path)
    new_class_names = [str(n) for n in dataset_info["names"]]
    cumulative_classes = merge_classes(config.get("classes") or [], new_class_names)

    is_first_session = not model_path.is_file() or not config.get("sessions")
    first_cfg = config.get("first_session") or {}
    fine_cfg = config.get("fine_tune") or {}

    if is_first_session:
        weights = str(resolve_path(root, config.get("base_weights", "yolo11n.pt")))
        if not Path(weights).exists() and not str(weights).endswith(".pt"):
            weights = config.get("base_weights", "yolo11n.pt")
        lr0 = float(first_cfg.get("lr0", 0.01))
        freeze = int(freeze_layers if freeze_layers is not None else first_cfg.get("freeze_layers", 0))
    else:
        weights = str(model_path)
        lr0 = float(fine_cfg.get("lr0", 0.0001))
        freeze = int(freeze_layers if freeze_layers is not None else fine_cfg.get("freeze_layers", 10))

    backup_path = None if is_first_session else backup_model(model_path, backup_dir)

    work_dir = root / ".train_workspace"
    work_dir.mkdir(parents=True, exist_ok=True)
    cumulative_yaml = write_cumulative_data_yaml(data_path, cumulative_classes, work_dir)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("Install ultralytics: pip install ultralytics") from exc

    model = YOLO(weights)

    train_kwargs: dict[str, Any] = {
        "data": str(cumulative_yaml),
        "epochs": int(epochs),
        "imgsz": int(config.get("imgsz", 640)),
        "batch": int(config.get("batch", 8)),
        "lr0": lr0,
        "device": config.get("device", "cpu"),
        "patience": int(config.get("patience", 15)),
        "workers": int(config.get("workers", 0)),
        "project": str(work_dir / "runs"),
        "name": "incremental",
        "exist_ok": True,
        "verbose": True,
    }
    if freeze > 0:
        train_kwargs["freeze"] = freeze
    if not is_first_session:
        train_kwargs["lrf"] = float(fine_cfg.get("lrf", 0.01))
        train_kwargs["warmup_epochs"] = int(fine_cfg.get("warmup_epochs", 3))
        train_kwargs["close_mosaic"] = int(fine_cfg.get("close_mosaic", 5))

    session_label = "1 (from base)" if is_first_session else f"{len(config.get('sessions') or []) + 1} (fine-tune)"
    print(f"Session {session_label}")
    print(f"  Weights in : {weights}")
    print(f"  Data       : {data_path}")
    print(f"  Classes    : {cumulative_classes}")
    print(f"  Epochs     : {epochs}")
    print(f"  lr0        : {lr0}")
    print(f"  freeze     : {freeze}")
    if backup_path:
        print(f"  Backup     : {backup_path}")

    results = model.train(**train_kwargs)
    run_dir = Path(getattr(results, "save_dir", work_dir / "runs" / "incremental"))
    best_pt = find_best_weights(run_dir)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_pt, model_path)

    metrics = {}
    if hasattr(results, "results_dict") and results.results_dict:
        rd = results.results_dict
        metrics = {
            "map50": float(rd.get("metrics/mAP50(B)", 0) or 0),
            "map50_95": float(rd.get("metrics/mAP50-95(B)", 0) or 0),
            "precision": float(rd.get("metrics/precision(B)", 0) or 0),
            "recall": float(rd.get("metrics/recall(B)", 0) or 0),
        }

    session_number = len(config.get("sessions") or []) + 1
    session_record = {
        "session": session_number,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset": str(data_path),
        "epochs": int(epochs),
        "classes": cumulative_classes,
        "freeze_layers": freeze,
        "lr0": lr0,
        "from_weights": weights,
        "backup": str(backup_path) if backup_path else None,
        "metrics": metrics,
        "note": session_note or None,
    }

    config["classes"] = cumulative_classes
    sessions: list[dict[str, Any]] = list(config.get("sessions") or [])
    sessions.append(session_record)
    config["sessions"] = sessions
    config["current_session"] = session_number
    config["last_updated"] = session_record["timestamp"]
    save_config(config_path, config)

    meta = {
        "model_path": str(model_path),
        "classes": cumulative_classes,
        "sessions": sessions,
        "latest_metrics": metrics,
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"  Saved      : {model_path} ({model_path.stat().st_size / 1024 / 1024:.2f} MB)")
    if metrics:
        print(f"  mAP50-95   : {metrics.get('map50_95', 0):.4f}")

    return session_record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Incremental YOLO11 training (same model.pt in place)")
    parser.add_argument("--data", required=True, help="Path to dataset data.yaml for this session")
    parser.add_argument("--epochs", type=int, required=True, help="Training epochs")
    parser.add_argument("--freeze", type=int, default=None, help="Freeze layers (default: 0 first session, 10 after)")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to train_config.yaml")
    parser.add_argument("--note", default="", help="Optional note for session history")
    args = parser.parse_args(argv)

    try:
        train_incremental(
            new_data=args.data,
            epochs=args.epochs,
            freeze_layers=args.freeze,
            config_path=args.config,
            session_note=args.note,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
