import uuid

from app.core.redis_client import get_sync_redis


class TrainingCancelled(Exception):
    """Raised when a training job is stopped by the user."""


def _cancel_key(job_id: str | uuid.UUID) -> str:
    return f"training:cancel:{str(job_id)}"


def request_training_cancel(job_id: str | uuid.UUID) -> None:
    get_sync_redis().setex(_cancel_key(job_id), 3600, "1")


def is_training_cancelled(job_id: str | uuid.UUID) -> bool:
    return get_sync_redis().get(_cancel_key(job_id)) is not None


def clear_training_cancel(job_id: str | uuid.UUID) -> None:
    get_sync_redis().delete(_cancel_key(job_id))
