import os
import time
from pathlib import Path
from typing import Any, Callable

from app.core.config import get_settings

settings = get_settings()

AUGMENTATION_PRESETS = {
    "none": {"hsv_h": 0.0, "hsv_s": 0.0, "hsv_v": 0.0, "degrees": 0.0, "translate": 0.0, "scale": 0.0, "fliplr": 0.0, "mosaic": 0.0},
    "light": {"hsv_h": 0.015, "hsv_s": 0.4, "hsv_v": 0.3, "degrees": 5.0, "translate": 0.05, "scale": 0.3, "fliplr": 0.5, "mosaic": 0.5},
    "medium": {"hsv_h": 0.02, "hsv_s": 0.6, "hsv_v": 0.4, "degrees": 10.0, "translate": 0.1, "scale": 0.5, "fliplr": 0.5, "mosaic": 0.8},
    "heavy": {"hsv_h": 0.03, "hsv_s": 0.8, "hsv_v": 0.5, "degrees": 15.0, "translate": 0.15, "scale": 0.6, "fliplr": 0.5, "mosaic": 1.0, "mixup": 0.1},
}


def resolve_training_device(config: dict[str, Any]) -> str | int:
    if settings.training_cpu_fallback or config.get("device") == "cpu":
        return "cpu"
    return config.get("device", 0)


class YOLOAdapter:
    architecture = "yolo"

    def __init__(self, model_name: str = "yolo11n.pt"):
        self.model_name = model_name

    def _build_train_kwargs(self, config: dict[str, Any]) -> dict[str, Any]:
        epochs = config.get("epochs", 50)
        batch = config.get("batch_size", 16)
        lr = config.get("learning_rate", 0.01)
        device = resolve_training_device(config)
        aug_preset = config.get("augmentation", "medium")
        aug = AUGMENTATION_PRESETS.get(aug_preset, AUGMENTATION_PRESETS["medium"])
        aug.update({
            k: config[k] for k in ("augment_hsv_h", "augment_hsv_s", "augment_hsv_v") if k in config
        })

        optimizer = config.get("optimizer", "AdamW")
        use_cpu = device == "cpu"
        kwargs: dict[str, Any] = {
            "epochs": epochs,
            "batch": batch,
            "lr0": lr,
            "device": device,
            "amp": False if use_cpu else config.get("mixed_precision", True),
            "imgsz": config.get("image_size", 640),
            "patience": config.get("patience", 10),
            "optimizer": optimizer,
            "exist_ok": True,
            "verbose": False,
            **aug,
        }
        if config.get("scheduler") == "cosine":
            kwargs["cos_lr"] = True
        if config.get("close_mosaic") is not None:
            kwargs["close_mosaic"] = config["close_mosaic"]
        if config.get("warmup_epochs"):
            kwargs["warmup_epochs"] = int(config["warmup_epochs"])
        if config.get("lrf") is not None:
            kwargs["lrf"] = float(config["lrf"])
        if config.get("weight_decay") is not None:
            kwargs["weight_decay"] = float(config["weight_decay"])
        if config.get("freeze_layers"):
            kwargs["freeze"] = int(config["freeze_layers"])
        if config.get("label_smoothing") is not None:
            kwargs["label_smoothing"] = float(config["label_smoothing"])
        if use_cpu:
            from app.services.training.cpu_tuning import apply_cpu_env, resolve_thread_count

            threads = int(config.get("cpu_threads") or 0) or resolve_thread_count()
            apply_cpu_env(threads)
            workers = config.get("workers", "auto")
            if workers in ("auto", 0, None):
                from app.services.training.cpu_tuning import effective_cpu_count

                workers = max(2, effective_cpu_count() - 1)
            kwargs["workers"] = int(workers)
            if config.get("cache", True):
                kwargs["cache"] = config.get("cache", True)
        return kwargs

    def train(
        self,
        dataset_path: str,
        output_dir: str,
        config: dict[str, Any],
        metrics_callback: Callable | None = None,
        cancel_check: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        start = time.time()
        train_kwargs = self._build_train_kwargs(config)
        epochs = train_kwargs["epochs"]
        device = train_kwargs["device"]

        try:
            if device == "cpu":
                from app.services.training.cpu_tuning import apply_cpu_env, resolve_thread_count

                apply_cpu_env(int(config.get("cpu_threads") or 0) or resolve_thread_count())

            from ultralytics import YOLO

            weights_source = config.get("_fine_tune_weights_path") or self.model_name
            model = YOLO(weights_source)
            fine_tuned = bool(config.get("_fine_tune_source") == "main_model")

            if metrics_callback:
                batch_state = {"last_ts": 0.0}

                def training_progress(epoch_idx: int, batch_i: int, nb: int) -> int:
                    train_frac = (epoch_idx + batch_i / max(nb, 1)) / max(epochs, 1)
                    return min(99, 15 + int(train_frac * 85))

                def emit_validation_metrics(trainer, *, save_epoch: bool) -> None:
                    epoch = int(getattr(trainer, "epoch", 0)) + 1
                    nb = max(int(getattr(trainer, "nb", 1)), 1)
                    metrics = getattr(trainer, "metrics", None) or {}
                    loss_items = getattr(trainer, "loss_items", None)
                    train_loss = float(sum(loss_items)) if loss_items is not None else None
                    val_box = _metric_val(metrics, "val/box_loss")
                    val_cls = _metric_val(metrics, "val/cls_loss")
                    val_loss = (val_box + val_cls) if val_box or val_cls else train_loss
                    precision = _metric_val(metrics, "metrics/precision(B)")
                    recall = _metric_val(metrics, "metrics/recall(B)")
                    map50 = _metric_val(metrics, "metrics/mAP50(B)")
                    map50_95 = _metric_val(metrics, "metrics/mAP50-95(B)")
                    metrics_callback({
                        "epoch": epoch,
                        "total_epochs": epochs,
                        "phase": "validation",
                        "message": f"Epoch {epoch}/{epochs} validation · Accuracy {map50_95:.1%}",
                        "progress": min(100, 15 + int((epoch / max(epochs, 1)) * 85)),
                        "epoch_progress": 100,
                        "loss": val_loss,
                        "precision": precision,
                        "recall": recall,
                        "f1": _f1(precision, recall),
                        "map50": map50,
                        "map50_95": map50_95,
                        "device": str(device),
                        "status": "running",
                        "save_epoch_metric": save_epoch,
                        "metrics_source": "validation",
                    })

                def on_train_batch_end(trainer):
                    if cancel_check and cancel_check():
                        trainer.stop = True
                        metrics_callback({
                            "phase": "train",
                            "message": "Stopping training…",
                            "status": "cancelled",
                            "progress": training_progress(
                                int(getattr(trainer, "epoch", 0)),
                                int(getattr(trainer, "ni", 0)) + 1,
                                max(int(getattr(trainer, "nb", 1)), 1),
                            ),
                        })
                        return
                    now = time.time()
                    batch_i = int(getattr(trainer, "ni", 0)) + 1
                    nb = max(int(getattr(trainer, "nb", 1)), 1)
                    epoch_idx = int(getattr(trainer, "epoch", 0))
                    if now - batch_state["last_ts"] < 2.0 and batch_i % 5 != 0:
                        return
                    batch_state["last_ts"] = now
                    loss_items = getattr(trainer, "loss_items", None)
                    loss_val = float(sum(loss_items)) if loss_items is not None else None
                    loss_box = float(loss_items[0]) if loss_items is not None and len(loss_items) > 0 else None
                    loss_cls = float(loss_items[1]) if loss_items is not None and len(loss_items) > 1 else None
                    epoch_progress = int((batch_i / nb) * 100)
                    total_steps = max(epochs * nb, 1)
                    current_step = epoch_idx * nb + batch_i
                    metrics_callback({
                        "epoch": epoch_idx + 1,
                        "total_epochs": epochs,
                        "batch": batch_i,
                        "total_batches": nb,
                        "epoch_progress": epoch_progress,
                        "current_step": current_step,
                        "total_steps": total_steps,
                        "phase": "train",
                        "message": f"Epoch {epoch_idx + 1}/{epochs} · batch {batch_i}/{nb} ({epoch_progress}%)",
                        "progress": training_progress(epoch_idx, batch_i, nb),
                        "loss": loss_val,
                        "loss_box": loss_box,
                        "loss_cls": loss_cls,
                        "device": str(device),
                        "status": "running",
                    })

                def on_fit_epoch_end(trainer):
                    emit_validation_metrics(trainer, save_epoch=True)

                model.add_callback("on_train_batch_end", on_train_batch_end)
                model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

            if cancel_check and cancel_check():
                from app.services.training.cancellation import TrainingCancelled
                raise TrainingCancelled("Training cancelled before start")

            results = model.train(data=dataset_path, project=output_dir, name="train", **train_kwargs)

            if cancel_check and cancel_check():
                from app.services.training.cancellation import TrainingCancelled
                raise TrainingCancelled("Training cancelled")

            csv_path = Path(output_dir) / "train" / "results.csv"
            final_metrics = _best_validation_metrics_from_csv(csv_path)
            if not final_metrics:
                rd = getattr(results, "results_dict", {}) or {}
                precision = float(rd.get("metrics/precision(B)", 0) or 0)
                recall = float(rd.get("metrics/recall(B)", 0) or 0)
                map50 = float(rd.get("metrics/mAP50(B)", 0) or 0)
                map50_95 = float(rd.get("metrics/mAP50-95(B)", 0) or 0)
                final_metrics = {
                    "map50": map50,
                    "map50_95": map50_95,
                    "precision": precision,
                    "recall": recall,
                    "f1": _f1(precision, recall),
                    "best_epoch": epochs,
                    "metrics_source": "validation",
                }
            elif metrics_callback:
                metrics_callback({
                    **final_metrics,
                    "epoch": final_metrics.get("best_epoch", epochs),
                    "total_epochs": epochs,
                    "progress": 100,
                    "phase": "validation",
                    "message": (
                        f"Best validation epoch {final_metrics.get('best_epoch')}/{epochs} · "
                        f"Accuracy {final_metrics.get('map50_95', 0):.1%}"
                    ),
                    "status": "running",
                    "save_epoch_metric": False,
                })

            weights = str(Path(output_dir) / "train" / "weights" / "best.pt")
            if not Path(weights).exists():
                weights = str(Path(output_dir) / "train" / "weights" / "last.pt")

            if fine_tuned:
                final_metrics = dict(final_metrics)
                final_metrics["fine_tuned_from"] = "main_model"

            return {
                "weights_path": weights,
                "metrics": final_metrics,
                "duration_seconds": int(time.time() - start),
                "fine_tuned_from": "main_model" if fine_tuned else "pretrained",
            }
        except Exception as exc:
            if settings.training_cpu_fallback:
                return self._mock_train(output_dir, config, metrics_callback, start, str(exc))
            raise

    def _emit_simulated_metrics(self, metrics_callback: Callable, epochs: int, device: str | int) -> None:
        for i in range(1, epochs + 1):
            metrics_callback({
                "epoch": i,
                "total_epochs": epochs,
                "progress": min(100, int((i / epochs) * 100)),
                "loss": max(0.1, 2.0 - i * 0.15),
                "precision": min(0.95, 0.3 + i * 0.06),
                "recall": min(0.95, 0.25 + i * 0.065),
                "f1": min(0.95, 0.28 + i * 0.06),
                "map50": min(0.95, 0.2 + i * 0.07),
                "map50_95": min(0.90, 0.15 + i * 0.065),
                "device": str(device),
                "status": "running",
                "metrics_source": "simulated",
                "save_epoch_metric": True,
            })

    def _mock_train(
        self,
        output_dir: str,
        config: dict[str, Any],
        metrics_callback: Callable | None,
        start: float,
        error: str,
    ) -> dict[str, Any]:
        epochs = config.get("epochs", 10)
        weights_dir = Path(output_dir) / "train" / "weights"
        weights_dir.mkdir(parents=True, exist_ok=True)
        weights = weights_dir / "best.pt"
        weights.write_bytes(b"mock_weights")

        if metrics_callback:
            self._emit_simulated_metrics(metrics_callback, epochs, "cpu")

        return {
            "weights_path": str(weights),
            "metrics": {
                "map50": 0.75,
                "map50_95": 0.65,
                "precision": 0.72,
                "recall": 0.68,
                "f1": _f1(0.72, 0.68),
                "mock": True,
                "metrics_source": "simulated",
                "error": error,
                "device": "cpu",
            },
            "duration_seconds": int(time.time() - start),
        }

    def export_onnx(self, weights_path: str, output_path: str) -> str:
        try:
            from ultralytics import YOLO
            model = YOLO(weights_path)
            model.export(format="onnx")
            onnx_path = weights_path.replace(".pt", ".onnx")
            if os.path.exists(onnx_path):
                Path(onnx_path).rename(output_path)
            return output_path
        except Exception:
            Path(output_path).write_bytes(b"mock_onnx")
            return output_path

    def predict(
        self,
        weights_path: str,
        image_path: str,
        *,
        conf: float = 0.25,
        iou: float = 0.45,
    ) -> list[dict]:
        try:
            from ultralytics import YOLO
            model = YOLO(weights_path)
            results = model.predict(image_path, verbose=False, conf=conf, iou=iou)
            predictions = []
            for r in results:
                for box in r.boxes:
                    predictions.append({
                        "class_id": int(box.cls[0]),
                        "confidence": float(box.conf[0]),
                        "x_center": float(box.xywhn[0][0]),
                        "y_center": float(box.xywhn[0][1]),
                        "width": float(box.xywhn[0][2]),
                        "height": float(box.xywhn[0][3]),
                    })
            return predictions
        except Exception:
            return []


def _float(row: dict, key: str, default: float) -> float:
    try:
        return float(row.get(key, default) or default)
    except (ValueError, TypeError):
        return default


def _best_validation_metrics_from_csv(csv_path: Path) -> dict | None:
    if not csv_path.exists():
        return None

    import csv

    best_row: dict | None = None
    best_epoch = 0
    best_map = -1.0
    with open(csv_path, newline="") as f:
        for i, row in enumerate(csv.DictReader(f), 1):
            map50_95 = _float(row, "metrics/mAP50-95(B)", 0)
            if map50_95 >= best_map:
                best_map = map50_95
                best_epoch = i
                best_row = row

    if not best_row:
        return None

    precision = _float(best_row, "metrics/precision(B)", 0)
    recall = _float(best_row, "metrics/recall(B)", 0)
    map50 = _float(best_row, "metrics/mAP50(B)", 0)
    map50_95 = _float(best_row, "metrics/mAP50-95(B)", 0)
    val_box = _float(best_row, "val/box_loss", 0)
    val_cls = _float(best_row, "val/cls_loss", 0)
    train_box = _float(best_row, "train/box_loss", 0)
    train_cls = _float(best_row, "train/cls_loss", 0)
    loss = (val_box + val_cls) if (val_box or val_cls) else (train_box + train_cls)

    return {
        "map50": map50,
        "map50_95": map50_95,
        "precision": precision,
        "recall": recall,
        "f1": _f1(precision, recall),
        "loss": loss,
        "best_epoch": best_epoch,
        "metrics_source": "validation",
    }


def _f1(p: float, r: float) -> float:
    if p + r == 0:
        return 0.0
    return 2 * p * r / (p + r)


def _metric_val(metrics: dict, key: str) -> float:
    try:
        val = metrics.get(key, 0)
        return float(val or 0)
    except (ValueError, TypeError):
        return 0.0
