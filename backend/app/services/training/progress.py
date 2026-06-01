import json
import uuid

from app.core.redis_client import get_sync_redis


def compute_eta_seconds(elapsed_seconds: int | float, progress: int) -> int | None:
    if progress <= 0 or progress >= 100 or elapsed_seconds <= 0:
        return None
    total_est = elapsed_seconds / (progress / 100)
    return max(0, int(total_est - elapsed_seconds))


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

    eta = live.get("eta_seconds")
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
    }
