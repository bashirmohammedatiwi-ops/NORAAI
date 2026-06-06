import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HyperparameterTrial, ModelArtifact, TrainingJob, TrainingMetric, TrainingStatus
from app.services.training.cpu_presets import CPU_PRESETS, DEFAULT_CPU_PRESET
from app.services.training.progress import get_training_progress, merge_live_progress

_BEST = CPU_PRESETS[DEFAULT_CPU_PRESET]


def _cpu_preset_options() -> list[dict]:
    keys = (
        "epochs",
        "batch_size",
        "learning_rate",
        "optimizer",
        "scheduler",
        "augmentation",
        "image_size",
        "mixed_precision",
        "val_split",
        "patience",
    )
    return [
        {
            "value": key,
            "label": preset["label"],
            "description": preset["description"],
            **{k: preset[k] for k in keys if k in preset},
        }
        for key, preset in CPU_PRESETS.items()
    ]


TRAINING_OPTIONS = {
    "architectures": [
        {"value": "yolo11", "label": "YOLO11", "description": "Latest Ultralytics YOLO"},
        {"value": "yolov10", "label": "YOLOv10", "description": "YOLOv10 real-time detection"},
        {"value": "rt_detr", "label": "RT-DETR", "description": "Real-time DEtection TRansformer"},
        {"value": "faster_rcnn", "label": "Faster R-CNN", "description": "Two-stage detector"},
        {"value": "efficientdet", "label": "EfficientDet", "description": "Efficient scaling detector"},
    ],
    "training_modes": [
        {"value": "single_gpu", "label": "CPU / Single GPU"},
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
        "epochs": _BEST["epochs"],
        "batch_size": _BEST["batch_size"],
        "learning_rate": _BEST["learning_rate"],
        "optimizer": _BEST["optimizer"],
        "scheduler": _BEST["scheduler"],
        "augmentation": _BEST["augmentation"],
        "mixed_precision": _BEST["mixed_precision"],
        "image_size": _BEST["image_size"],
        "val_split": _BEST["val_split"],
        "hpo_trials": 5,
        "patience": _BEST["patience"],
        "device": "auto",
    },
    "cpu_presets": _cpu_preset_options(),
    "default_cpu_preset": DEFAULT_CPU_PRESET,
    "recommendations": {
        "architecture": "yolo11",
        "preset": DEFAULT_CPU_PRESET,
        "notes": [
            "Fine-tune Main Model continues from your active weights — fastest mAP improvement.",
            "Use Best Accuracy for first training; Fine-tune preset for retraining.",
            "Keep Mixed Precision OFF on CPU — it only helps on GPU.",
            "Review labels and add diverse road/camera images before retraining.",
        ],
        "default_fine_tune": True,
        "ultimate_preset": "ultimate_accuracy",
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
    best_metric = await db.execute(
        select(TrainingMetric)
        .where(TrainingMetric.training_job_id == job_id)
        .order_by(TrainingMetric.map50_95.desc().nullslast(), TrainingMetric.epoch.desc())
        .limit(1)
    )
    best = best_metric.scalar_one_or_none()
    artifact = await db.execute(
        select(ModelArtifact).where(ModelArtifact.training_job_id == job_id).limit(1)
    )
    art = artifact.scalar_one_or_none()
    trials_count = await db.execute(
        select(func.count(HyperparameterTrial.id)).where(HyperparameterTrial.training_job_id == job_id)
    )

    progress, current_epoch, epochs_total = _job_progress(job, latest)
    live = await asyncio.to_thread(get_training_progress, job_id)

    duration = None
    if job.started_at:
        end = job.completed_at or datetime.now(timezone.utc)
        duration = int((end - job.started_at).total_seconds())

    live_fields = merge_live_progress(job.status.value, progress, current_epoch, live, duration)
    progress = live_fields["progress"]
    current_epoch = live_fields["current_epoch"]

    def _metric_row(row: TrainingMetric | None) -> dict | None:
        if not row:
            return None
        return {
            "loss": row.loss,
            "precision": row.precision,
            "recall": row.recall,
            "f1": row.f1,
            "map50": row.map50,
            "map50_95": row.map50_95,
        }

    db_metrics = _metric_row(latest)
    best_db_metrics = _metric_row(best)

    latest_metrics = db_metrics
    metrics_meta: dict | None = None

    if job.status == TrainingStatus.COMPLETED:
        source_metrics = best_db_metrics or db_metrics
        if art and art.metrics:
            am = art.metrics or {}
            source_metrics = {
                "loss": am.get("loss", source_metrics.get("loss") if source_metrics else None),
                "precision": am.get("precision", source_metrics.get("precision") if source_metrics else None),
                "recall": am.get("recall", source_metrics.get("recall") if source_metrics else None),
                "f1": am.get("f1", source_metrics.get("f1") if source_metrics else None),
                "map50": am.get("map50", source_metrics.get("map50") if source_metrics else None),
                "map50_95": am.get("map50_95", source_metrics.get("map50_95") if source_metrics else None),
            }
        latest_metrics = source_metrics
        best_epoch = (art.metrics or {}).get("best_epoch") if art and art.metrics else (best.epoch if best else latest.epoch if latest else None)
        metrics_meta = {
            "source": (art.metrics or {}).get("metrics_source", "validation") if art and art.metrics else "validation",
            "best_epoch": best_epoch,
            "simulated": bool((art.metrics or {}).get("mock")) if art and art.metrics else False,
        }
        if latest_metrics and all(
            (latest_metrics.get(k) or 0) >= 0.95 for k in ("precision", "recall", "map50", "map50_95") if latest_metrics.get(k) is not None
        ):
            metrics_meta["high_score_warning"] = (
                "الدرجات فوق 95% غالباً تحدث مع مجموعة تحقق (validation) صغيرة جداً "
                "ولا تعني بالضرورة أن النموذج سيعمل بنفس الأداء على صور جديدة."
            )
    elif job.status in (TrainingStatus.RUNNING, TrainingStatus.PENDING):
        latest_metrics = {
            "loss": live_fields.get("loss") if live_fields.get("loss") is not None else db_metrics.get("loss") if db_metrics else None,
            "precision": live_fields.get("precision") if live_fields.get("precision") is not None else db_metrics.get("precision") if db_metrics else None,
            "recall": live_fields.get("recall") if live_fields.get("recall") is not None else db_metrics.get("recall") if db_metrics else None,
            "f1": live_fields.get("f1") if live_fields.get("f1") is not None else db_metrics.get("f1") if db_metrics else None,
            "map50": live_fields.get("map50") if live_fields.get("map50") is not None else db_metrics.get("map50") if db_metrics else None,
            "map50_95": live_fields.get("map50_95") if live_fields.get("map50_95") is not None else db_metrics.get("map50_95") if db_metrics else None,
        }

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
        "phase": live_fields.get("phase"),
        "message": live_fields.get("message"),
        "batch": live_fields.get("batch"),
        "total_batches": live_fields.get("total_batches"),
        "epoch_progress": live_fields.get("epoch_progress"),
        "export_current": live_fields.get("export_current"),
        "export_total": live_fields.get("export_total"),
        "current_step": live_fields.get("current_step"),
        "total_steps": live_fields.get("total_steps"),
        "eta_seconds": live_fields.get("eta_seconds"),
        "epoch_elapsed_seconds": live_fields.get("epoch_elapsed_seconds"),
        "epoch_eta_seconds": live_fields.get("epoch_eta_seconds"),
        "batches_per_min": live_fields.get("batches_per_min"),
        "batches_per_min_avg": live_fields.get("batches_per_min_avg"),
        "batches_per_min_epoch": live_fields.get("batches_per_min_epoch"),
        "sec_per_batch": live_fields.get("sec_per_batch"),
        "images_per_min": live_fields.get("images_per_min"),
        "train_images": live_fields.get("train_images"),
        "val_images": live_fields.get("val_images"),
        "exported_images": live_fields.get("exported_images"),
        "labeled_train_images": live_fields.get("labeled_train_images"),
        "yolo_train_images": live_fields.get("yolo_train_images"),
        "duration_seconds": duration,
        "metrics_count": metrics_count.scalar() or 0,
        "trials_count": trials_count.scalar() or 0,
        "latest_metrics": latest_metrics,
        "metrics_meta": metrics_meta,
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
