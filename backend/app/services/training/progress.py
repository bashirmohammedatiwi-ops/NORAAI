import json
import uuid

from app.core.redis_client import get_sync_redis


def publish_training_progress(job_id: str, payload: dict) -> None:
    redis = get_sync_redis()
    body = {**payload, "job_id": job_id}
    redis.publish(f"training:{job_id}", json.dumps(body))
    redis.setex(f"training:progress:{job_id}", 3600, json.dumps(body))


def get_training_progress(job_id: uuid.UUID | str) -> dict | None:
    try:
        raw = get_sync_redis().get(f"training:progress:{str(job_id)}")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return None


def merge_live_progress(job_status: str, db_progress: int, db_epoch: int, live: dict | None) -> dict:
    if not live or job_status not in ("running", "pending"):
        return {
            "progress": db_progress,
            "current_epoch": db_epoch,
            "phase": None,
            "message": None,
            "batch": None,
            "total_batches": None,
        }

    progress = int(live.get("progress", db_progress) or db_progress)
    epoch = int(live.get("epoch", db_epoch) or db_epoch)
    return {
        "progress": min(100, max(0, progress)),
        "current_epoch": epoch,
        "phase": live.get("phase"),
        "message": live.get("message"),
        "batch": live.get("batch"),
        "total_batches": live.get("total_batches"),
        "loss": live.get("loss"),
    }
