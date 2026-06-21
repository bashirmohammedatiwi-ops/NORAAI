"""Background YOLO training with live metrics, charts data, and progress tracking."""

from __future__ import annotations

import copy
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.hardware import device_label, pick_device
from backend.storage import get_dataset, model_dir, save_model_meta

_lock = threading.Lock()
_state: dict[str, Any] = {
    "status": "idle",
    "phase": "idle",
    "progress": 0,
    "message": "",
    "epoch": 0,
    "total_epochs": 0,
    "batch": 0,
    "total_batches": 0,
    "epoch_progress": 0,
    "metrics": {},
    "epoch_history": [],
    "cancel_requested": False,
    "model_id": None,
    "device": "cpu",
    "started_at": None,
    "elapsed_seconds": 0,
    "eta_seconds": 0,
    "batches_per_min": 0.0,
    "log": [],
}


def _append_log(msg: str) -> None:
    with _lock:
        _state["log"].append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "message": msg,
        })
        if len(_state["log"]) > 300:
            _state["log"] = _state["log"][-300:]


def get_training_state() -> dict:
    with _lock:
        out = copy.deepcopy(_state)
    if out.get("started_at") and out.get("status") == "running":
        try:
            started = datetime.fromisoformat(out["started_at"])
            out["elapsed_seconds"] = int((datetime.now(timezone.utc) - started).total_seconds())
        except (TypeError, ValueError):
            pass
    return out


def request_cancel() -> None:
    with _lock:
        _state["cancel_requested"] = True
        _state["message"] = "Stopping…"
        _state["phase"] = "cancelling"


def _is_cancelled() -> bool:
    with _lock:
        return bool(_state["cancel_requested"])


def _update(**kwargs: Any) -> None:
    with _lock:
        _state.update(kwargs)


def _append_epoch_record(record: dict) -> None:
    with _lock:
        history = _state.setdefault("epoch_history", [])
        epoch = record.get("epoch")
        for i, row in enumerate(history):
            if row.get("epoch") == epoch:
                history[i] = {**row, **record}
                return
        history.append(record)


AUG_PRESETS = {
    "none": {"hsv_h": 0.0, "hsv_s": 0.0, "hsv_v": 0.0, "degrees": 0.0, "translate": 0.0, "scale": 0.0, "fliplr": 0.0, "mosaic": 0.0},
    "light": {"hsv_h": 0.015, "hsv_s": 0.4, "hsv_v": 0.3, "degrees": 5.0, "translate": 0.05, "scale": 0.3, "fliplr": 0.5, "mosaic": 0.5},
    "medium": {"hsv_h": 0.02, "hsv_s": 0.6, "hsv_v": 0.4, "degrees": 10.0, "translate": 0.1, "scale": 0.5, "fliplr": 0.5, "mosaic": 0.8},
    "heavy": {"hsv_h": 0.03, "hsv_s": 0.8, "hsv_v": 0.5, "degrees": 15.0, "translate": 0.15, "scale": 0.6, "fliplr": 0.5, "mosaic": 1.0, "mixup": 0.1},
}


def _metric_val(metrics: object | None, key: str) -> float | None:
    if metrics is None:
        return None
    val = None
    if isinstance(metrics, dict):
        val = metrics.get(key)
    elif hasattr(metrics, "results_dict"):
        rd = getattr(metrics, "results_dict")
        if isinstance(rd, dict):
            val = rd.get(key)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _read_trainer_metrics(trainer) -> dict[str, float | None]:
    raw = getattr(trainer, "metrics", None)
    val_box = _metric_val(raw, "val/box_loss")
    val_cls = _metric_val(raw, "val/cls_loss")
    precision = _metric_val(raw, "metrics/precision(B)")
    recall = _metric_val(raw, "metrics/recall(B)")
    map50 = _metric_val(raw, "metrics/mAP50(B)")
    map50_95 = _metric_val(raw, "metrics/mAP50-95(B)")
    val_loss = None
    if val_box is not None and val_cls is not None:
        val_loss = val_box + val_cls
    f1 = None
    if precision is not None and recall is not None and (precision + recall) > 0:
        f1 = 2 * precision * recall / (precision + recall)
    return {
        "val_box": val_box,
        "val_cls": val_cls,
        "val_loss": val_loss,
        "precision": precision,
        "recall": recall,
        "map50": map50,
        "map50_95": map50_95,
        "f1": f1,
    }


def _float_csv(row: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(row.get(key, default) or default)
    except (ValueError, TypeError):
        return default


def _read_csv_epoch(csv_path: Path, epoch: int) -> dict[str, float | None] | None:
    if not csv_path.exists():
        return None
    import csv

    row: dict | None = None
    with open(csv_path, newline="") as f:
        for i, r in enumerate(csv.DictReader(f), 1):
            if i == epoch:
                row = r
                break
    if not row:
        return None
    precision = _float_csv(row, "metrics/precision(B)")
    recall = _float_csv(row, "metrics/recall(B)")
    map50 = _float_csv(row, "metrics/mAP50(B)")
    map50_95 = _float_csv(row, "metrics/mAP50-95(B)")
    val_box = _float_csv(row, "val/box_loss")
    val_cls = _float_csv(row, "val/cls_loss")
    train_box = _float_csv(row, "train/box_loss")
    train_cls = _float_csv(row, "train/cls_loss")
    loss = (val_box + val_cls) if (val_box or val_cls) else (train_box + train_cls)
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {
        "loss": loss,
        "loss_box": train_box,
        "loss_cls": train_cls,
        "val_loss": val_box + val_cls if (val_box or val_cls) else None,
        "precision": precision,
        "recall": recall,
        "map50": map50,
        "map50_95": map50_95,
        "f1": f1,
    }


def start_training(
    dataset_id: str,
    config: dict[str, Any],
    fine_tune_weights: str | None = None,
) -> str:
    with _lock:
        if _state["status"] == "running":
            raise RuntimeError("Training already running")

    dataset = get_dataset(dataset_id)
    if not dataset or not dataset.get("data_yaml"):
        raise ValueError("Dataset not found or missing data.yaml")

    model_variant = config.get("model_variant", "n")
    if model_variant not in ("n", "s"):
        model_variant = "n"

    model_id = str(uuid.uuid4())
    output_dir = model_dir(model_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    with _lock:
        _state.update({
            "status": "running",
            "phase": "setup",
            "progress": 0,
            "message": "Starting…",
            "epoch": 0,
            "total_epochs": int(config.get("epochs", 50)),
            "batch": 0,
            "total_batches": 0,
            "epoch_progress": 0,
            "metrics": {},
            "epoch_history": [],
            "cancel_requested": False,
            "model_id": model_id,
            "device": pick_device(config.get("device", "auto")),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_seconds": 0,
            "eta_seconds": 0,
            "batches_per_min": 0.0,
            "log": [],
        })

    thread = threading.Thread(
        target=_run_training,
        args=(dataset, config, model_variant, model_id, output_dir, fine_tune_weights),
        daemon=True,
    )
    thread.start()
    return model_id


def _run_training(
    dataset: dict,
    config: dict[str, Any],
    model_variant: str,
    model_id: str,
    output_dir: Path,
    fine_tune_weights: str | None,
) -> None:
    start = time.time()
    csv_path = output_dir / "train" / "results.csv"
    batch_state: dict[str, Any] = {
        "epoch_start": time.time(),
        "last_batch_ts": time.time(),
        "last_batch_i": 0,
    }

    try:
        from ultralytics import YOLO

        device = pick_device(config.get("device", "auto"))
        _update(device=device, phase="setup", message=f"Device: {device_label(device)}")
        _append_log(f"Device: {device_label(device)}")

        weights = fine_tune_weights or f"yolo11{model_variant}.pt"
        _append_log(f"Loading weights: {weights}")
        model = YOLO(weights)

        epochs = int(config.get("epochs", 50))
        batch = int(config.get("batch_size", 8))
        imgsz = int(config.get("image_size", 640))
        lr = float(config.get("learning_rate", 0.01))
        patience = int(config.get("patience", 10))
        optimizer = config.get("optimizer", "AdamW")
        aug = AUG_PRESETS.get(config.get("augmentation", "light"), AUG_PRESETS["light"])

        use_cpu = device == "cpu"
        train_kwargs: dict[str, Any] = {
            "data": dataset["data_yaml"],
            "epochs": epochs,
            "batch": batch,
            "imgsz": imgsz,
            "lr0": lr,
            "device": device,
            "patience": patience,
            "optimizer": optimizer,
            "project": str(output_dir),
            "name": "train",
            "exist_ok": True,
            "verbose": False,
            "amp": not use_cpu,
            "workers": 0 if use_cpu else 4,
            "plots": True,
            **aug,
        }
        if config.get("scheduler") == "cosine":
            train_kwargs["cos_lr"] = True

        def calc_eta(epoch_idx: int, epoch_prog: float) -> int:
            elapsed = time.time() - start
            total_frac = (epoch_idx + epoch_prog / 100.0) / max(epochs, 1)
            if total_frac <= 0.01:
                return 0
            total_est = elapsed / total_frac
            return max(0, int(total_est - elapsed))

        def on_train_batch_end(trainer) -> None:
            if _is_cancelled():
                trainer.stop = True
                return
            now = time.time()
            batch_i = int(getattr(trainer, "ni", 0)) + 1
            nb = max(int(getattr(trainer, "nb", 1)), 1)
            epoch_idx = int(getattr(trainer, "epoch", 0))
            epoch_prog = int((batch_i / nb) * 100)

            loss_items = getattr(trainer, "loss_items", None)
            loss = float(sum(loss_items)) if loss_items is not None else None
            loss_box = float(loss_items[0]) if loss_items is not None and len(loss_items) > 0 else None
            loss_cls = float(loss_items[1]) if loss_items is not None and len(loss_items) > 1 else None

            bpm = 0.0
            prev_i = batch_state.get("last_batch_i", 0)
            prev_ts = batch_state.get("last_batch_ts", now)
            if batch_i > prev_i and (now - prev_ts) > 0.1:
                bpm = ((batch_i - prev_i) / (now - prev_ts)) * 60.0
                batch_state["last_batch_ts"] = now
                batch_state["last_batch_i"] = batch_i

            overall = min(99, int(((epoch_idx + batch_i / nb) / max(epochs, 1)) * 100))
            eta = calc_eta(epoch_idx, epoch_prog)

            _update(
                phase="train",
                epoch=epoch_idx + 1,
                batch=batch_i,
                total_batches=nb,
                epoch_progress=epoch_prog,
                progress=overall,
                message=f"Epoch {epoch_idx + 1}/{epochs} · batch {batch_i}/{nb}",
                metrics={
                    "loss": loss,
                    "loss_box": loss_box,
                    "loss_cls": loss_cls,
                },
                elapsed_seconds=int(now - start),
                eta_seconds=eta,
                batches_per_min=round(bpm, 1),
            )

        def on_train_epoch_start(trainer) -> None:
            batch_state["epoch_start"] = time.time()
            batch_state["last_batch_i"] = 0
            batch_state["last_batch_ts"] = time.time()
            epoch = int(getattr(trainer, "epoch", 0)) + 1
            _update(phase="train", message=f"Epoch {epoch}/{epochs} starting…")

        def on_train_epoch_end(trainer) -> None:
            if _is_cancelled():
                trainer.stop = True
                return
            epoch = int(getattr(trainer, "epoch", 0)) + 1
            loss_items = getattr(trainer, "loss_items", None)
            loss = float(sum(loss_items)) if loss_items is not None else None
            loss_box = float(loss_items[0]) if loss_items is not None and len(loss_items) > 0 else None
            loss_cls = float(loss_items[1]) if loss_items is not None and len(loss_items) > 1 else None
            _append_epoch_record({
                "epoch": epoch,
                "loss": loss,
                "loss_box": loss_box,
                "loss_cls": loss_cls,
                "phase": "train",
            })
            _append_log(
                f"Epoch {epoch}/{epochs} train complete · loss={loss:.4f}" if loss else f"Epoch {epoch}/{epochs} train complete"
            )

        def on_fit_epoch_end(trainer) -> None:
            epoch = int(getattr(trainer, "epoch", 0)) + 1
            _update(phase="validation", message=f"Epoch {epoch}/{epochs} · validation…")
            parsed = _read_trainer_metrics(trainer)
            csv_row = _read_csv_epoch(csv_path, epoch)
            if csv_row:
                for k, v in csv_row.items():
                    if v is not None and parsed.get(k) is None:
                        parsed[k] = v
            record = {
                "epoch": epoch,
                "loss": parsed.get("loss"),
                "loss_box": parsed.get("loss_box"),
                "loss_cls": parsed.get("loss_cls"),
                "val_loss": parsed.get("val_loss"),
                "precision": parsed.get("precision"),
                "recall": parsed.get("recall"),
                "map50": parsed.get("map50"),
                "map50_95": parsed.get("map50_95"),
                "f1": parsed.get("f1"),
                "phase": "validation",
            }
            _append_epoch_record(record)
            progress = min(99, int((epoch / max(epochs, 1)) * 100))
            map_pct = (parsed.get("map50_95") or 0) * 100
            _update(
                phase="train",
                epoch=epoch,
                progress=progress,
                message=f"Epoch {epoch}/{epochs} · mAP50-95 {map_pct:.1f}%",
                metrics=parsed,
                elapsed_seconds=int(time.time() - start),
                eta_seconds=calc_eta(epoch, 100),
            )
            _append_log(
                f"Validation epoch {epoch}: mAP50-95={(parsed.get('map50_95') or 0):.3f} · "
                f"P={(parsed.get('precision') or 0):.3f} · R={(parsed.get('recall') or 0):.3f}"
            )

        model.add_callback("on_train_batch_end", on_train_batch_end)
        model.add_callback("on_train_epoch_start", on_train_epoch_start)
        model.add_callback("on_train_epoch_end", on_train_epoch_end)
        model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

        if _is_cancelled():
            _update(status="cancelled", phase="cancelled", message="Cancelled before start", progress=0)
            return

        _append_log("Training started")
        model.train(**train_kwargs)

        if _is_cancelled():
            _update(status="cancelled", phase="cancelled", message="Training cancelled")
            return

        best_pt = output_dir / "train" / "weights" / "best.pt"
        if not best_pt.exists():
            best_pt = output_dir / "train" / "weights" / "last.pt"
        if not best_pt.exists():
            raise FileNotFoundError("No weights produced after training")

        final_dest = output_dir / "best.pt"
        __import__("shutil").copy2(best_pt, final_dest)

        metrics = _read_best_metrics(csv_path)
        duration = int(time.time() - start)
        history = get_training_state().get("epoch_history", [])

        save_model_meta({
            "id": model_id,
            "name": config.get("name") or f"YOLO11{model_variant}",
            "model_variant": model_variant,
            "architecture": "yolo11",
            "class_names": dataset.get("class_names", []),
            "metrics": metrics,
            "epoch_history": history,
            "duration_seconds": duration,
            "device": device,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "dataset_id": dataset.get("id"),
            "weights_path": str(final_dest),
        })

        _update(
            status="completed",
            phase="completed",
            progress=100,
            message="Training completed",
            metrics=metrics,
            model_id=model_id,
            elapsed_seconds=duration,
            eta_seconds=0,
        )
        _append_log(f"Done · mAP50-95={metrics.get('map50_95', 0):.3f}")

    except Exception as exc:
        _update(status="failed", phase="failed", message=str(exc))
        _append_log(f"Error: {exc}")


def _read_best_metrics(csv_path: Path) -> dict:
    if not csv_path.exists():
        return {}
    import csv

    best_row: dict | None = None
    best_map = -1.0
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            m = _float_csv(row, "metrics/mAP50-95(B)")
            if m >= best_map:
                best_map = m
                best_row = row
    if not best_row:
        return {}
    precision = _float_csv(best_row, "metrics/precision(B)")
    recall = _float_csv(best_row, "metrics/recall(B)")
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {
        "map50": _float_csv(best_row, "metrics/mAP50(B)"),
        "map50_95": _float_csv(best_row, "metrics/mAP50-95(B)"),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "loss": _float_csv(best_row, "val/box_loss") + _float_csv(best_row, "val/cls_loss"),
    }


def export_model(model_id: str, format: str = "pt") -> Path | None:
    meta_path = model_dir(model_id) / "meta.json"
    if not meta_path.exists():
        return None
    import json

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    weights = Path(meta.get("weights_path", ""))
    if not weights.exists():
        return None

    if format == "pt":
        return weights

    if format == "onnx":
        onnx_path = model_dir(model_id) / "model.onnx"
        if onnx_path.exists():
            return onnx_path
        from ultralytics import YOLO

        model = YOLO(str(weights))
        model.export(format="onnx", simplify=True, dynamic=False, imgsz=640, nms=True)
        exported = weights.with_suffix(".onnx")
        if exported.exists():
            exported.rename(onnx_path)
            meta["onnx_path"] = str(onnx_path)
            meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
            return onnx_path
    return None
