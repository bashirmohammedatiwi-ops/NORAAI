"""In-place incremental model updates — same artifact & MinIO weights key across sessions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.minio_client import copy_object, upload_bytes
from app.models import ModelArtifact, ModelLifecycle, TrainingJob
from app.services.driver.project_classes import is_production_model, model_class_names
from app.services.models.active_model import (
    MAIN_MODEL_NAME,
    ensure_live_deployment_sync,
    get_active_model_sync,
    promote_as_active_model_sync,
)
from app.services.training.fine_tune import wants_continue_training


def merge_class_names(existing: list[str], new_names: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for name in [*existing, *new_names]:
        key = str(name).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(key)
    return merged


def resolve_continue_target_artifact(
    session: Session,
    project_id: uuid.UUID,
    config: dict,
) -> ModelArtifact | None:
    """Artifact whose weights should be updated in place (not a new registry entry)."""
    if not wants_continue_training(config):
        return None

    raw_id = config.get("_continue_artifact_id") or config.get("source_model_artifact_id")
    if raw_id:
        try:
            artifact = session.get(ModelArtifact, uuid.UUID(str(raw_id)))
        except (TypeError, ValueError):
            artifact = None
        if artifact and artifact.project_id == project_id and is_production_model(artifact):
            return artifact

    artifact = get_active_model_sync(session, project_id)
    if artifact and is_production_model(artifact):
        return artifact
    return None


def backup_weights_key(project_id: uuid.UUID, artifact_id: uuid.UUID) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"projects/{project_id}/models/backups/{artifact_id}_{stamp}.pt"


def append_training_session(
    metrics: dict,
    *,
    job: TrainingJob,
    config: dict,
    backup_key: str | None,
    classes_used: list[str],
) -> dict:
    out = dict(metrics)
    prior = dict(out.get("training_sessions_meta") or {})
    sessions: list[dict[str, Any]] = list(prior.get("sessions") or out.get("training_sessions") or [])
    session_number = len(sessions) + 1
    record = {
        "session": session_number,
        "job_id": str(job.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "epochs": int(config.get("epochs") or 0),
        "classes": classes_used,
        "freeze_layers": config.get("freeze_layers"),
        "lr0": config.get("learning_rate"),
        "fine_tune_source": config.get("_fine_tune_source"),
        "backup_key": backup_key,
        "metrics": {
            k: out.get(k)
            for k in ("map50", "map50_95", "precision", "recall", "f1", "loss")
            if out.get(k) is not None
        },
    }
    sessions.append(record)
    out["training_sessions"] = sessions
    out["training_sessions_meta"] = {
        "current_session": session_number,
        "last_updated": record["timestamp"],
        "sessions": sessions,
    }
    out["incremental"] = True
    out["in_place_update"] = True
    return out


def persist_trained_model(
    session: Session,
    *,
    job: TrainingJob,
    config: dict,
    weights_bytes: bytes,
    training_metrics: dict,
    classes_used: list[str],
    onnx_bytes: bytes | None,
) -> ModelArtifact:
    """
    Continue training: overwrite existing artifact weights + update record.
    Fresh training: create new artifact (previous behaviour).
    """
    from app.models import ModelLifecycle

    target = resolve_continue_target_artifact(session, job.project_id, config)
    in_place = bool(
        target
        and config.get("_continue_artifact_id")
        and str(target.id) == str(config.get("_continue_artifact_id"))
        and config.get("_fine_tune_weights_path")
        and wants_continue_training(config)
    )

    if in_place and target is not None:
        backup_key: str | None = None
        if target.minio_weights_key:
            try:
                backup_key = backup_weights_key(job.project_id, target.id)
                copy_object(target.minio_weights_key, backup_key, content_type="application/octet-stream")
            except Exception:
                backup_key = None

        upload_bytes(target.minio_weights_key, weights_bytes, "application/octet-stream")

        merged_classes = merge_class_names(model_class_names(target), classes_used)
        metrics = append_training_session(
            training_metrics,
            job=job,
            config=config,
            backup_key=backup_key,
            classes_used=merged_classes,
        )

        if onnx_bytes and target.minio_onnx_key:
            upload_bytes(target.minio_onnx_key, onnx_bytes, "application/octet-stream")
        elif onnx_bytes:
            onnx_key = f"projects/{job.project_id}/models/{target.id}/model.onnx"
            upload_bytes(onnx_key, onnx_bytes, "application/octet-stream")
            target.minio_onnx_key = onnx_key

        target.training_job_id = job.id
        target.classes_used = merged_classes
        target.metrics = metrics
        target.model_size_mb = len(weights_bytes) / (1024 * 1024)
        target.training_duration_seconds = training_metrics.get("duration_seconds") or target.training_duration_seconds
        target.gpu_used = str(config.get("device", "cpu"))
        target.name = MAIN_MODEL_NAME
        target.lifecycle = ModelLifecycle.PRODUCTION
        target.architecture = job.architecture.value

        session.flush()
        promote_as_active_model_sync(session, job.project_id, target.id)
        ensure_live_deployment_sync(session, job.project_id, target.id)

        try:
            from app.services.inference.model_cache import invalidate_weights

            invalidate_weights(target.minio_weights_key)
        except Exception:
            pass

        return target

    # New model artifact (first training or explicit from-scratch)
    minio_key = f"projects/{job.project_id}/models/{job.id}/best.pt"
    upload_bytes(minio_key, weights_bytes, "application/octet-stream")

    onnx_key: str | None = None
    if onnx_bytes:
        onnx_key = f"projects/{job.project_id}/models/{job.id}/model.onnx"
        upload_bytes(onnx_key, onnx_bytes, "application/octet-stream")

    try:
        from app.services.inference.model_cache import invalidate_weights

        invalidate_weights(minio_key)
    except Exception:
        pass

    metrics = dict(training_metrics)
    metrics["incremental"] = False
    metrics["in_place_update"] = False
    metrics["training_sessions"] = [{
        "session": 1,
        "job_id": str(job.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "epochs": int(config.get("epochs") or 0),
        "classes": classes_used,
        "metrics": {
            k: metrics.get(k)
            for k in ("map50", "map50_95", "precision", "recall", "f1", "loss")
            if metrics.get(k) is not None
        },
    }]
    metrics["training_sessions_meta"] = {
        "current_session": 1,
        "last_updated": metrics["training_sessions"][0]["timestamp"],
        "sessions": metrics["training_sessions"],
    }

    artifact = ModelArtifact(
        project_id=job.project_id,
        training_job_id=job.id,
        name=MAIN_MODEL_NAME,
        architecture=job.architecture.value,
        lifecycle=ModelLifecycle.REGISTERED,
        minio_weights_key=minio_key,
        minio_onnx_key=onnx_key,
        dataset_version_id=job.dataset_version_id,
        classes_used=classes_used,
        metrics=metrics,
        gpu_used=str(config.get("device", "cpu")),
        training_duration_seconds=training_metrics.get("duration_seconds"),
        model_size_mb=len(weights_bytes) / (1024 * 1024),
    )
    session.add(artifact)
    session.flush()

    promote_as_active_model_sync(session, job.project_id, artifact.id)
    ensure_live_deployment_sync(session, job.project_id, artifact.id)
    return artifact
