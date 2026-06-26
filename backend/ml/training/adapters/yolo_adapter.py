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
    from app.services.training.hardware import resolve_training_device_value

    return resolve_training_device_value(config, settings)


class YOLOAdapter:
    architecture = "yolo"

    def __init__(self, model_name: str = "yolo11n.pt"):
        self.model_name = model_name

    def _build_train_kwargs(self, config: dict[str, Any]) -> dict[str, Any]:
        epochs = config.get("epochs", 50)
        batch = config.get("batch_size", 16)
        lr = config.get("learning_rate", 0.01)
        device = resolve_training_device(config)
        from app.services.training.hardware import is_cpu_device, ultralytics_device

        yolo_device = ultralytics_device(device)
        aug_preset = config.get("augmentation", "medium")
        aug = AUGMENTATION_PRESETS.get(aug_preset, AUGMENTATION_PRESETS["medium"])
        aug.update({
            k: config[k] for k in ("augment_hsv_h", "augment_hsv_s", "augment_hsv_v") if k in config
        })

        optimizer = config.get("optimizer", "AdamW")
        use_cpu = is_cpu_device(device)
        kwargs: dict[str, Any] = {
            "epochs": epochs,
            "batch": batch,
            "lr0": lr,
            "device": yolo_device,
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
            workers = config.get("workers", 0)
            kwargs["workers"] = int(workers) if workers not in ("auto", None) else 0
            kwargs["plots"] = False
            kwargs["save_json"] = False
            kwargs["save_hybrid"] = False
            kwargs["deterministic"] = False
            kwargs["multi_scale"] = False
            if config.get("_rect"):
                kwargs["rect"] = True
            if config.get("_fast_aug"):
                kwargs["mosaic"] = min(float(kwargs.get("mosaic", 0.5)), 0.25)
                kwargs["mixup"] = 0.0
                kwargs["copy_paste"] = 0.0
                kwargs["erasing"] = 0.0
                kwargs["auto_augment"] = None
                kwargs["degrees"] = min(float(kwargs.get("degrees", 10.0)), 5.0)
                kwargs["translate"] = min(float(kwargs.get("translate", 0.1)), 0.05)
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
        device = resolve_training_device(config)
        from app.services.training.hardware import is_cpu_device

        try:
            if is_cpu_device(device):
                from app.services.training.cpu_tuning import apply_cpu_env, resolve_thread_count

                apply_cpu_env(int(config.get("cpu_threads") or 0) or resolve_thread_count())

            from ultralytics import YOLO

            weights_source = config.get("_fine_tune_weights_path") or self.model_name
            continuing = bool(config.get("_fine_tune_weights_path"))
            model = YOLO(weights_source)
            fine_tuned = continuing
            if metrics_callback and continuing:
                mb = config.get("_fine_tune_weights_mb")
                src = config.get("_fine_tune_source") or "existing"
                metrics_callback({
                    "phase": "setup",
                    "message": (
                        f"YOLO loaded existing weights ({src})"
                        + (f" · {mb} MB" if mb else "")
                        + f" — not starting from {self.model_name}"
                    ),
                    "status": "running",
                    "fine_tune_source": src,
                })

            if metrics_callback:
                from app.services.training.progress import (
                    compute_epoch_eta_seconds,
                    compute_job_eta_from_epoch_pace,
                )

                train_batch_size = int(train_kwargs.get("batch") or config.get("batch_size") or 16)

                val_every = int(config.get("_val_every") or 1)
                batch_state: dict[str, Any] = {
                    "last_ts": 0.0,
                    "epoch_start_ts": time.time(),
                    "last_epoch_idx": -1,
                    "last_batch_i": 0,
                    "last_speed_ts": None,
                    "ema_batches_per_min": None,
                    "speed_window": [],
                    "avg_anchor_batch": 0,
                    "avg_anchor_ts": None,
                    "batch_intervals": [],
                    "epoch_pace_bpm": None,
                    "validation_ran": True,
                    "val_every": val_every,
                }
                _WARMUP_BATCHES = 5

                def training_progress(epoch_idx: int, batch_i: int, nb: int) -> int:
                    train_frac = (epoch_idx + batch_i / max(nb, 1)) / max(epochs, 1)
                    return min(99, 15 + int(train_frac * 85))

                def emit_validation_metrics(trainer, *, save_epoch: bool) -> None:
                    epoch = int(getattr(trainer, "epoch", 0)) + 1
                    loss_items = getattr(trainer, "loss_items", None)
                    train_loss = float(sum(loss_items)) if loss_items is not None else None
                    validation_ran = bool(batch_state.get("validation_ran", True))

                    if not validation_ran:
                        metrics_callback({
                            "epoch": epoch,
                            "total_epochs": epochs,
                            "phase": "train",
                            "message": (
                                f"Epoch {epoch}/{epochs} train complete · "
                                f"validation runs every {batch_state.get('val_every', val_every)} epochs"
                            ),
                            "progress": min(100, 15 + int((epoch / max(epochs, 1)) * 85)),
                            "epoch_progress": 100,
                            "loss": train_loss,
                            "device": str(device),
                            "status": "running",
                            "save_epoch_metric": False,
                            "validation_skipped": True,
                        })
                        return

                    parsed = _read_trainer_metrics(trainer)
                    csv_path = Path(output_dir) / "train" / "results.csv"
                    if parsed.get("map50_95") in (None, 0.0) and parsed.get("map50") in (None, 0.0):
                        csv_row = _read_csv_metrics_for_epoch(csv_path, epoch)
                        if csv_row:
                            for key, val in csv_row.items():
                                if val is not None and (parsed.get(key) in (None, 0.0)):
                                    parsed[key] = val

                    val_box = parsed.get("val_box")
                    val_cls = parsed.get("val_cls")
                    val_loss = (val_box + val_cls) if val_box is not None and val_cls is not None else train_loss
                    precision = parsed.get("precision") or 0.0
                    recall = parsed.get("recall") or 0.0
                    map50 = parsed.get("map50") or 0.0
                    map50_95 = parsed.get("map50_95") or 0.0
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
                    nb = max(
                        int(batch_state.get("yolo_nb") or 0),
                        int(getattr(trainer, "nb", 1)),
                        1,
                    )
                    epoch_idx = int(getattr(trainer, "epoch", 0))
                    min_interval = 0.8
                    batch_stride = 1 if nb <= 200 else 2

                    loss_items = getattr(trainer, "loss_items", None)
                    loss_val = float(sum(loss_items)) if loss_items is not None else None
                    loss_box = float(loss_items[0]) if loss_items is not None and len(loss_items) > 0 else None
                    loss_cls = float(loss_items[1]) if loss_items is not None and len(loss_items) > 1 else None
                    epoch_progress = int((batch_i / nb) * 100)
                    total_steps = max(epochs * nb, 1)
                    current_step = epoch_idx * nb + batch_i
                    epoch_elapsed = max(0.0, now - float(batch_state["epoch_start_ts"] or now))

                    prev_batch = int(batch_state.get("last_batch_i") or 0)
                    prev_speed_ts = batch_state.get("last_speed_ts")
                    instant_bpm: float | None = None
                    if prev_speed_ts is not None and batch_i > prev_batch:
                        delta_t = now - float(prev_speed_ts)
                        delta_b = batch_i - prev_batch
                        if delta_t > 0.1 and delta_b > 0:
                            instant_bpm = (delta_b / delta_t) * 60.0

                    ema_bpm = batch_state.get("ema_batches_per_min")
                    if instant_bpm is not None:
                        ema_bpm = instant_bpm if ema_bpm is None else (0.72 * instant_bpm + 0.28 * float(ema_bpm))
                        batch_state["ema_batches_per_min"] = ema_bpm

                    batch_state["last_batch_i"] = batch_i
                    batch_state["last_speed_ts"] = now

                    speed_window: list[tuple[float, int]] = batch_state.setdefault("speed_window", [])
                    speed_window.append((now, batch_i))
                    while speed_window and now - speed_window[0][0] > 60.0:
                        speed_window.pop(0)

                    rolling_bpm: float | None = None
                    if len(speed_window) >= 2:
                        t0, b0 = speed_window[0]
                        t1, b1 = speed_window[-1]
                        dt = t1 - t0
                        if dt > 0.4 and b1 > b0:
                            rolling_bpm = ((b1 - b0) / dt) * 60.0

                    if instant_bpm is not None and instant_bpm > 0:
                        interval_sec = 60.0 / instant_bpm
                        intervals: list[float] = batch_state.setdefault("batch_intervals", [])
                        intervals.append(interval_sec)
                        if len(intervals) > 24:
                            intervals.pop(0)

                    if batch_i >= _WARMUP_BATCHES and batch_state.get("avg_anchor_ts") is None:
                        batch_state["avg_anchor_ts"] = now
                        batch_state["avg_anchor_batch"] = batch_i
                    steady_bpm: float | None = None
                    anchor_ts = batch_state.get("avg_anchor_ts")
                    anchor_batch = int(batch_state.get("avg_anchor_batch") or 0)
                    if anchor_ts is not None and batch_i > anchor_batch:
                        steady_elapsed = now - float(anchor_ts)
                        steady_bpm = ((batch_i - anchor_batch) / max(steady_elapsed, 0.5)) * 60.0

                    interval_mean_bpm: float | None = None
                    intervals = batch_state.get("batch_intervals") or []
                    if len(intervals) >= 3:
                        mean_sec = sum(intervals) / len(intervals)
                        if mean_sec > 0:
                            interval_mean_bpm = 60.0 / mean_sec

                    epoch_pace_bpm = interval_mean_bpm or steady_bpm or rolling_bpm
                    if epoch_pace_bpm is not None:
                        batch_state["epoch_pace_bpm"] = epoch_pace_bpm

                    at_epoch_end = batch_i >= nb or epoch_progress >= 99
                    if at_epoch_end:
                        display_bpm = epoch_pace_bpm or steady_bpm or rolling_bpm or float(ema_bpm or 0)
                    else:
                        display_bpm = float(ema_bpm) if ema_bpm is not None else (epoch_pace_bpm or steady_bpm or rolling_bpm or 0.0)
                    if display_bpm <= 0 and epoch_pace_bpm:
                        display_bpm = epoch_pace_bpm

                    batches_per_min = round(display_bpm, 1)
                    batches_per_min_avg = round(rolling_bpm or interval_mean_bpm or steady_bpm or display_bpm, 1)
                    batches_per_min_epoch = round(
                        epoch_pace_bpm or steady_bpm or rolling_bpm or display_bpm,
                        1,
                    )

                    if (
                        now - batch_state["last_ts"] < min_interval
                        and batch_i % batch_stride != 0
                        and batch_i < nb
                    ):
                        return
                    batch_state["last_ts"] = now
                    sec_per_batch = round(60.0 / display_bpm, 1) if display_bpm > 0 else round(
                        epoch_elapsed / max(batch_i, 1), 1
                    )
                    images_per_min = int(round(display_bpm * train_batch_size))

                    # Guaranteed non-zero pace: refined epoch pace > smoothed > raw cumulative.
                    cumulative_bpm = (batch_i / max(epoch_elapsed, 0.5)) * 60.0
                    pace_for_eta = epoch_pace_bpm or display_bpm or cumulative_bpm or 1.0
                    remaining_batches = max(0, nb - batch_i)
                    epoch_eta = max(0, int((remaining_batches / pace_for_eta) * 60))

                    epoch_total_est = (nb / pace_for_eta) * 60.0
                    remaining_this_epoch = max(0.0, epoch_total_est - epoch_elapsed)
                    epochs_after = max(0, epochs - (epoch_idx + 1))
                    job_eta = max(0, int(remaining_this_epoch + epochs_after * epoch_total_est))
                    metrics_callback({
                        "epoch": epoch_idx + 1,
                        "total_epochs": epochs,
                        "batch": batch_i,
                        "total_batches": nb,
                        "train_images": config.get("_train_images"),
                        "val_images": config.get("_val_images"),
                        "exported_images": config.get("_exported_images"),
                        "epoch_progress": epoch_progress,
                        "epoch_elapsed_seconds": int(epoch_elapsed),
                        "epoch_eta_seconds": epoch_eta,
                        "batches_per_min": batches_per_min,
                        "batches_per_min_avg": batches_per_min_avg,
                        "batches_per_min_epoch": batches_per_min_epoch,
                        "sec_per_batch": sec_per_batch,
                        "images_per_min": images_per_min,
                        "eta_seconds": job_eta,
                        "current_step": current_step,
                        "total_steps": total_steps,
                        "phase": "train",
                        "message": (
                            f"Epoch {epoch_idx + 1}/{epochs} · {epoch_progress}% · "
                            f"{batches_per_min} batch/min ({images_per_min} img/min)"
                        ),
                        "progress": training_progress(epoch_idx, batch_i, nb),
                        "loss": loss_val,
                        "loss_box": loss_box,
                        "loss_cls": loss_cls,
                        "device": str(device),
                        "status": "running",
                    })

                def on_fit_epoch_end(trainer):
                    emit_validation_metrics(trainer, save_epoch=True)

                def on_pretrain_routine_end(trainer):
                    loader = getattr(trainer, "train_loader", None)
                    if loader is None:
                        return
                    try:
                        yolo_nb = max(int(len(loader)), 1)
                        batch_state["yolo_nb"] = yolo_nb
                        dataset = getattr(loader, "dataset", None)
                        n_imgs = len(getattr(dataset, "im_files", []) or []) or len(dataset or [])
                        metrics_callback({
                            "phase": "setup",
                            "message": (
                                f"YOLO loader: {n_imgs} train images · {yolo_nb} batches · "
                                f"batch {train_batch_size}"
                            ),
                            "total_batches": yolo_nb,
                            "yolo_train_images": n_imgs,
                            "status": "running",
                        })
                    except Exception:
                        pass

                def on_train_epoch_start(trainer):
                    epoch_idx = int(getattr(trainer, "epoch", 0))
                    if batch_state["last_epoch_idx"] != epoch_idx:
                        batch_state["epoch_start_ts"] = time.time()
                        batch_state["last_epoch_idx"] = epoch_idx
                        batch_state["last_batch_i"] = 0
                        batch_state["last_speed_ts"] = time.time()
                        batch_state["ema_batches_per_min"] = None
                        batch_state["speed_window"] = []
                        batch_state["avg_anchor_ts"] = None
                        batch_state["avg_anchor_batch"] = 0
                        batch_state["batch_intervals"] = []
                        batch_state["epoch_pace_bpm"] = None
                    epoch = epoch_idx + 1
                    total = int(getattr(trainer, "epochs", epochs) or epochs)
                    run_val = val_every <= 1 or epoch % val_every == 0 or epoch >= total
                    batch_state["validation_ran"] = run_val
                    if hasattr(trainer, "args"):
                        trainer.args.val = run_val

                model.add_callback("on_pretrain_routine_end", on_pretrain_routine_end)
                model.add_callback("on_train_batch_end", on_train_batch_end)
                model.add_callback("on_train_epoch_start", on_train_epoch_start)
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
            if getattr(settings, "training_mock_on_failure", False):
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
        weights = Path(weights_path)
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)

        def _find_exported() -> Path | None:
            candidates: list[Path] = [weights.with_suffix(".onnx")]
            for pattern in ("*_end2end.onnx", "*.onnx"):
                candidates.extend(weights.parent.glob(pattern))
            seen: set[str] = set()
            ordered = sorted(
                (p for p in candidates if p.is_file()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for path in ordered:
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                if path.stat().st_size > 10_000:
                    return path
            return None

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise ValueError("Ultralytics is not installed on the server") from exc

        model = YOLO(str(weights))
        last_err: Exception | None = None
        for simplify in (True, False):
            try:
                exported = model.export(
                    format="onnx",
                    simplify=simplify,
                    dynamic=False,
                    imgsz=640,
                    nms=True,
                )
                src: Path | None = None
                if exported:
                    candidate = Path(str(exported))
                    if candidate.is_file() and candidate.stat().st_size > 10_000:
                        src = candidate
                if src is None:
                    src = _find_exported()
                if src is None:
                    raise ValueError("ONNX export did not produce a model file")
                if src.resolve() != out.resolve():
                    out.write_bytes(src.read_bytes())
                if not out.is_file() or out.stat().st_size < 10_000:
                    raise ValueError("ONNX export produced an empty or invalid file")
                return str(out)
            except Exception as exc:
                last_err = exc
                continue

        raise ValueError(f"ONNX export failed: {last_err}") from last_err

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
    if val is None and hasattr(metrics, "get"):
        try:
            val = metrics.get(key)  # type: ignore[union-attr]
        except Exception:
            val = None
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
    return {
        "val_box": val_box,
        "val_cls": val_cls,
        "precision": _metric_val(raw, "metrics/precision(B)"),
        "recall": _metric_val(raw, "metrics/recall(B)"),
        "map50": _metric_val(raw, "metrics/mAP50(B)"),
        "map50_95": _metric_val(raw, "metrics/mAP50-95(B)"),
    }


def _read_csv_metrics_for_epoch(csv_path: Path, epoch: int) -> dict[str, float | None] | None:
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
    return {
        "val_box": _float(row, "val/box_loss", 0) or None,
        "val_cls": _float(row, "val/cls_loss", 0) or None,
        "precision": _float(row, "metrics/precision(B)", 0) or None,
        "recall": _float(row, "metrics/recall(B)", 0) or None,
        "map50": _float(row, "metrics/mAP50(B)", 0) or None,
        "map50_95": _float(row, "metrics/mAP50-95(B)", 0) or None,
    }
