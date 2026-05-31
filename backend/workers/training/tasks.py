import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.minio_client import upload_bytes
from app.core.redis_client import get_sync_redis
from app.models import (
    ClassLabel,
    HyperparameterTrial,
    ModelArtifact,
    ModelLifecycle,
    TrainingJob,
    TrainingMetric,
    TrainingStatus,
)
from app.services.training.dataset_exporter import export_yolo_dataset_sync
from ml.training.adapters import get_adapter
from ml.training.hpo import run_hpo
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


def publish_metric(job_id: str, metrics: dict):
    redis = get_sync_redis()
    payload = json.dumps({**metrics, "job_id": job_id, "timestamp": datetime.now(timezone.utc).isoformat()})
    redis.publish(f"training:{job_id}", payload)
    redis.setex(f"training:progress:{job_id}", 3600, payload)


@celery_app.task(name="workers.training.tasks.run_training_job")
def run_training_job(job_id: str):
    session = SessionLocal()
    artifact = None
    try:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if not job:
            return {"error": "Job not found"}

        job.status = TrainingStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        session.commit()

        config = dict(job.config or {})
        adapter = get_adapter(job.architecture.value)

        with tempfile.TemporaryDirectory() as tmpdir:
            if job.dataset_version_id:
                yaml_path, class_names = export_yolo_dataset_sync(
                    session, job.dataset_version_id, tmpdir, config.get("val_split", 0.2)
                )
            else:
                yaml_path = os.path.join(tmpdir, "data.yaml")
                Path(yaml_path).write_text(
                    f"path: {tmpdir}\ntrain: images/train\nval: images/val\nnc: 1\nnames: ['object']\n"
                )
                for split in ("train", "val"):
                    os.makedirs(os.path.join(tmpdir, "images", split), exist_ok=True)
                class_names = ["object"]

            def metrics_callback(m):
                publish_metric(job_id, m)
                metric = TrainingMetric(
                    training_job_id=job.id,
                    epoch=m["epoch"],
                    loss=m.get("loss"),
                    precision=m.get("precision"),
                    recall=m.get("recall"),
                    f1=m.get("f1"),
                    map50=m.get("map50"),
                    map50_95=m.get("map50_95"),
                )
                session.add(metric)
                session.commit()

            publish_metric(job_id, {"epoch": 0, "status": "running", "message": "Training started"})

            if job.hpo_enabled:
                def hpo_train_fn(params):
                    trial_config = {**config, **params}
                    result = adapter.train(yaml_path, tmpdir, trial_config, metrics_callback)
                    trial_num = session.query(HyperparameterTrial).filter_by(training_job_id=job.id).count() + 1
                    trial = HyperparameterTrial(
                        training_job_id=job.id,
                        trial_number=trial_num,
                        params=params,
                        metrics=result.get("metrics", {}),
                        status="completed",
                    )
                    session.add(trial)
                    session.commit()
                    return result.get("metrics", {}).get("map50_95", 0.0)

                run_hpo(config.get("hpo_trials", 5), hpo_train_fn, f"job_{job_id}")
                trials = session.query(HyperparameterTrial).filter_by(training_job_id=job.id).all()
                if trials:
                    session.query(HyperparameterTrial).filter_by(training_job_id=job.id).update({"is_best": False})
                    best_trial = max(
                        trials,
                        key=lambda t: (t.metrics or {}).get("map50_95", 0),
                    )
                    best_trial.is_best = True
                    config = {**config, **best_trial.params}
                    session.commit()

            result = adapter.train(yaml_path, tmpdir, config, metrics_callback)

            weights_path = result["weights_path"]
            weights_bytes = Path(weights_path).read_bytes() if Path(weights_path).exists() else b"mock"
            minio_key = f"projects/{job.project_id}/models/{job.id}/best.pt"
            upload_bytes(minio_key, weights_bytes, "application/octet-stream")

            onnx_path = os.path.join(tmpdir, "model.onnx")
            adapter.export_onnx(weights_path, onnx_path)
            onnx_key = f"projects/{job.project_id}/models/{job.id}/model.onnx"
            if os.path.exists(onnx_path):
                upload_bytes(onnx_key, Path(onnx_path).read_bytes(), "application/octet-stream")

            classes_used = class_names
            if job.dataset_version_id is None:
                cls_result = session.query(ClassLabel).filter_by(project_id=job.project_id, is_archived=False).all()
                classes_used = [c.name for c in cls_result]

            artifact = ModelArtifact(
                project_id=job.project_id,
                training_job_id=job.id,
                name=f"{job.name}-v1",
                architecture=job.architecture.value,
                lifecycle=ModelLifecycle.REGISTERED,
                minio_weights_key=minio_key,
                minio_onnx_key=onnx_key if os.path.exists(onnx_path) else None,
                dataset_version_id=job.dataset_version_id,
                classes_used=classes_used,
                metrics=result.get("metrics", {}),
                gpu_used=str(config.get("device", "cpu")),
                training_duration_seconds=result.get("duration_seconds"),
                model_size_mb=len(weights_bytes) / (1024 * 1024),
            )
            session.add(artifact)

        job.status = TrainingStatus.COMPLETED
        job.completed_at = datetime.now(timezone.utc)
        session.commit()
        publish_metric(job_id, {"epoch": config.get("epochs", 50), "status": "completed", "artifact_id": str(artifact.id)})
        return {"status": "completed", "artifact_id": str(artifact.id)}
    except Exception as exc:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if job:
            job.status = TrainingStatus.FAILED
            job.error_message = str(exc)
            session.commit()
        publish_metric(job_id, {"status": "failed", "error": str(exc)})
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()


@celery_app.task(name="workers.training.tasks.cancel_training_job")
def cancel_training_job(job_id: str):
    session = SessionLocal()
    try:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if job and job.status in (TrainingStatus.PENDING, TrainingStatus.RUNNING):
            job.status = TrainingStatus.CANCELLED
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
            publish_metric(job_id, {"status": "cancelled"})
        return {"status": "cancelled"}
    finally:
        session.close()
