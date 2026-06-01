import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HyperparameterTrial, ModelArtifact, TrainingJob, TrainingMetric, TrainingStatus


TRAINING_OPTIONS = {
    "architectures": [
        {"value": "yolo11", "label": "YOLO11", "description": "Latest Ultralytics YOLO"},
        {"value": "yolov10", "label": "YOLOv10", "description": "YOLOv10 real-time detection"},
        {"value": "rt_detr", "label": "RT-DETR", "description": "Real-time DEtection TRansformer"},
        {"value": "faster_rcnn", "label": "Faster R-CNN", "description": "Two-stage detector"},
        {"value": "efficientdet", "label": "EfficientDet", "description": "Efficient scaling detector"},
    ],
    "training_modes": [
        {"value": "single_gpu", "label": "Single GPU"},
        {"value": "multi_gpu", "label": "Multi GPU (DDP)"},
        {"value": "distributed", "label": "Distributed Training"},
    ],
    "optimizers": ["SGD", "Adam", "AdamW", "RMSProp"],
    "schedulers": ["cosine", "linear", "step", "onecycle", "none"],
    "augmentation_presets": [
        {"value": "none", "label": "None"},
        {"value": "light", "label": "Light"},
        {"value": "medium", "label": "Medium"},
        {"value": "heavy", "label": "Heavy (Road/Traffic)"},
    ],
    "defaults": {
        "epochs": 50,
        "batch_size": 16,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "mixed_precision": True,
        "image_size": 640,
        "val_split": 0.2,
        "hpo_trials": 5,
        "patience": 10,
    },
}


def _job_progress(job: TrainingJob, latest: TrainingMetric | None) -> tuple[int, int, int]:
    epochs_total = (job.config or {}).get("epochs", 50)
    current_epoch = latest.epoch if latest else 0
    progress = min(100, int((current_epoch / epochs_total) * 100)) if epochs_total else 0
    if job.status == TrainingStatus.COMPLETED:
        progress = 100
    elif job.status == TrainingStatus.PENDING:
        progress = 0
    return progress, current_epoch, epochs_total


async def get_job_detail(db: AsyncSession, job_id: uuid.UUID) -> dict | None:
    job = await db.get(TrainingJob, job_id)
    if not job:
        return None

    metrics_count = await db.execute(
        select(func.count(TrainingMetric.id)).where(TrainingMetric.training_job_id == job_id)
    )
    latest_metric = await db.execute(
        select(TrainingMetric)
        .where(TrainingMetric.training_job_id == job_id)
        .order_by(TrainingMetric.epoch.desc())
        .limit(1)
    )
    latest = latest_metric.scalar_one_or_none()
    artifact = await db.execute(
        select(ModelArtifact).where(ModelArtifact.training_job_id == job_id).limit(1)
    )
    art = artifact.scalar_one_or_none()
    trials_count = await db.execute(
        select(func.count(HyperparameterTrial.id)).where(HyperparameterTrial.training_job_id == job_id)
    )

    progress, current_epoch, epochs_total = _job_progress(job, latest)

    duration = None
    if job.started_at:
        end = job.completed_at or datetime.now(timezone.utc)
        duration = int((end - job.started_at).total_seconds())

    return {
        "id": str(job.id),
        "project_id": str(job.project_id),
        "name": job.name,
        "architecture": job.architecture.value,
        "training_mode": job.training_mode.value,
        "status": job.status.value,
        "hpo_enabled": job.hpo_enabled,
        "config": job.config or {},
        "model_definition_id": str(job.model_definition_id) if job.model_definition_id else None,
        "dataset_version_id": str(job.dataset_version_id) if job.dataset_version_id else None,
        "celery_task_id": job.celery_task_id,
        "error_message": job.error_message,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "created_at": job.created_at.isoformat(),
        "progress": progress,
        "current_epoch": current_epoch,
        "total_epochs": epochs_total,
        "duration_seconds": duration,
        "metrics_count": metrics_count.scalar() or 0,
        "trials_count": trials_count.scalar() or 0,
        "latest_metrics": {
            "loss": latest.loss if latest else None,
            "precision": latest.precision if latest else None,
            "recall": latest.recall if latest else None,
            "f1": latest.f1 if latest else None,
            "map50": latest.map50 if latest else None,
            "map50_95": latest.map50_95 if latest else None,
        } if latest else None,
        "artifact": {
            "id": str(art.id),
            "name": art.name,
            "metrics": art.metrics,
            "model_size_mb": art.model_size_mb,
            "lifecycle": art.lifecycle.value,
        } if art else None,
        "device": (job.config or {}).get("device", "cpu"),
    }


async def job_to_summary(db: AsyncSession, job: TrainingJob) -> dict:
    latest_metric = await db.execute(
        select(TrainingMetric)
        .where(TrainingMetric.training_job_id == job.id)
        .order_by(TrainingMetric.epoch.desc())
        .limit(1)
    )
    latest = latest_metric.scalar_one_or_none()
    progress, current_epoch, total_epochs = _job_progress(job, latest)
    return {
        "id": job.id,
        "name": job.name,
        "architecture": job.architecture.value,
        "status": job.status.value,
        "hpo_enabled": job.hpo_enabled,
        "created_at": job.created_at,
        "error_message": job.error_message,
        "progress": progress,
        "current_epoch": current_epoch,
        "total_epochs": total_epochs,
    }
