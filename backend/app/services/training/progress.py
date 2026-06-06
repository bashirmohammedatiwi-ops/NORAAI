import json
import uuid

from app.core.redis_client import get_sync_redis


def compute_eta_seconds(elapsed_seconds: int | float, progress: int) -> int | None:
    if progress <= 0 or progress >= 100 or elapsed_seconds <= 0:
        return None
    total_est = elapsed_seconds / (progress / 100)
    return max(0, int(total_est - elapsed_seconds))


def compute_epoch_eta_seconds(epoch_elapsed_seconds: float, epoch_progress: int) -> int | None:
    if epoch_progress <= 0 or epoch_progress >= 100 or epoch_elapsed_seconds <= 0:
        return None
    total_est = epoch_elapsed_seconds / (epoch_progress / 100)
    return max(0, int(total_est - epoch_elapsed_seconds))


def compute_job_eta_from_epoch_pace(
    epoch_elapsed_seconds: float,
    epoch_progress: int,
    current_epoch: int,
    total_epochs: int,
) -> int | None:
    if epoch_progress <= 0 or epoch_elapsed_seconds <= 0 or total_epochs <= 0:
        return None
    epoch_total_est = epoch_elapsed_seconds / (epoch_progress / 100)
    remaining_this_epoch = max(0.0, epoch_total_est - epoch_elapsed_seconds)
    epochs_after_current = max(0, int(total_epochs) - int(current_epoch))
    return max(0, int(remaining_this_epoch + epochs_after_current * epoch_total_est))


def _progress_key(job_id: str | uuid.UUID) -> str:
    return f"training:progress:{str(job_id)}"


def publish_training_progress(job_id: str | uuid.UUID, payload: dict) -> None:
    redis = get_sync_redis()
    data = json.dumps(payload)
    redis.setex(_progress_key(job_id), 3600, data)
    redis.publish(f"training:{job_id}", data)


def get_training_progress(job_id: str | uuid.UUID) -> dict | None:
    try:
        raw = get_sync_redis().get(_progress_key(job_id))
    except Exception:
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def merge_live_progress(
    job_status: str,
    db_progress: int,
    db_epoch: int,
    live: dict | None,
    elapsed_seconds: int | None = None,
) -> dict:
    base = {
        "progress": db_progress,
        "current_epoch": db_epoch,
        "phase": None,
        "message": None,
        "batch": None,
        "total_batches": None,
        "epoch_progress": None,
        "export_current": None,
        "export_total": None,
        "current_step": None,
        "total_steps": None,
        "loss": None,
        "precision": None,
        "recall": None,
        "f1": None,
        "map50": None,
        "map50_95": None,
        "eta_seconds": None,
        "epoch_elapsed_seconds": None,
        "epoch_eta_seconds": None,
        "batches_per_min": None,
        "batches_per_min_avg": None,
        "batches_per_min_epoch": None,
        "sec_per_batch": None,
        "images_per_min": None,
        "train_images": None,
        "val_images": None,
        "exported_images": None,
        "labeled_train_images": None,
        "yolo_train_images": None,
    }

    if not live or job_status not in ("running", "pending"):
        if elapsed_seconds and db_progress > 0:
            base["eta_seconds"] = compute_eta_seconds(elapsed_seconds, db_progress)
        return base

    progress = min(100, max(0, int(live.get("progress", db_progress) or db_progress)))
    epoch = int(live.get("epoch", db_epoch) or db_epoch)
    batch = live.get("batch")
    total_batches = live.get("total_batches")
    epoch_progress = live.get("epoch_progress")
    if epoch_progress is None and batch and total_batches:
        epoch_progress = int((int(batch) / max(int(total_batches), 1)) * 100)

    epoch_elapsed = live.get("epoch_elapsed_seconds")
    epoch_eta = live.get("epoch_eta_seconds")
    if epoch_eta is None and epoch_elapsed and epoch_progress:
        epoch_eta = compute_epoch_eta_seconds(float(epoch_elapsed), int(epoch_progress))

    total_epochs = int(live.get("total_epochs") or 0)
    eta = live.get("eta_seconds")
    if eta is None and epoch_elapsed and epoch_progress and total_epochs > 0:
        eta = compute_job_eta_from_epoch_pace(
            float(epoch_elapsed),
            int(epoch_progress),
            epoch,
            total_epochs,
        )
    if eta is None and elapsed_seconds:
        eta = compute_eta_seconds(elapsed_seconds, progress)

    return {
        "progress": progress,
        "current_epoch": epoch,
        "phase": live.get("phase"),
        "message": live.get("message"),
        "batch": batch,
        "total_batches": total_batches,
        "epoch_progress": epoch_progress,
        "export_current": live.get("export_current"),
        "export_total": live.get("export_total"),
        "current_step": live.get("current_step"),
        "total_steps": live.get("total_steps"),
        "loss": live.get("loss"),
        "precision": live.get("precision"),
        "recall": live.get("recall"),
        "f1": live.get("f1"),
        "map50": live.get("map50"),
        "map50_95": live.get("map50_95"),
        "eta_seconds": eta,
        "epoch_elapsed_seconds": epoch_elapsed,
        "epoch_eta_seconds": epoch_eta,
        "batches_per_min": live.get("batches_per_min"),
        "batches_per_min_avg": live.get("batches_per_min_avg"),
        "batches_per_min_epoch": live.get("batches_per_min_epoch"),
        "sec_per_batch": live.get("sec_per_batch"),
        "images_per_min": live.get("images_per_min"),
        "train_images": live.get("train_images"),
        "val_images": live.get("val_images"),
        "exported_images": live.get("exported_images"),
        "labeled_train_images": live.get("labeled_train_images"),
        "yolo_train_images": live.get("yolo_train_images"),
    }
