import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Project, TrainingJob, TrainingMetric, TrainingStatus
from app.services.training.progress import get_training_progress, merge_live_progress
from app.services.training.service import _job_progress


async def _latest_metrics_by_job(
    db: AsyncSession,
    job_ids: list[uuid.UUID],
) -> dict[uuid.UUID, TrainingMetric]:
    if not job_ids:
        return {}

    max_epoch = (
        select(
            TrainingMetric.training_job_id.label("job_id"),
            func.max(TrainingMetric.epoch).label("max_epoch"),
        )
        .where(TrainingMetric.training_job_id.in_(job_ids))
        .group_by(TrainingMetric.training_job_id)
        .subquery()
    )
    result = await db.execute(
        select(TrainingMetric)
        .join(
            max_epoch,
            (TrainingMetric.training_job_id == max_epoch.c.job_id)
            & (TrainingMetric.epoch == max_epoch.c.max_epoch),
        )
    )
    return {metric.training_job_id: metric for metric in result.scalars().all()}


async def fetch_active_training_jobs(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    settings = get_settings()
    result = await db.execute(
        select(TrainingJob, Project.name)
        .join(Project, Project.id == TrainingJob.project_id)
        .where(
            Project.organization_id == org_id,
            TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
        )
        .order_by(TrainingJob.started_at.desc().nullslast(), TrainingJob.created_at.desc())
    )

    rows = result.all()
    if not rows:
        return []

    latest_by_job = await _latest_metrics_by_job(db, [job.id for job, _ in rows])

    jobs: list[dict] = []
    live_by_job: dict[uuid.UUID, dict | None] = {}
    if rows:
        live_results = await asyncio.gather(
            *[asyncio.to_thread(get_training_progress, job.id) for job, _ in rows],
            return_exceptions=True,
        )
        for (job, _), live in zip(rows, live_results, strict=True):
            live_by_job[job.id] = live if isinstance(live, dict) else None

    for job, project_name in rows:
        latest = latest_by_job.get(job.id)
        progress, current_epoch, total_epochs = _job_progress(job, latest)
        live = live_by_job.get(job.id)

        duration = None
        if job.started_at:
            duration = int((datetime.now(timezone.utc) - job.started_at).total_seconds())

        live_fields = merge_live_progress(job.status.value, progress, current_epoch, live, duration)
        from app.services.training.hardware import device_label as format_device_label
        from app.services.training.hardware import resolve_training_device_value

        device = resolve_training_device_value(job.config or {}, settings)
        device_label = format_device_label(device)

        latest_metrics = None
        if job.status in (TrainingStatus.RUNNING, TrainingStatus.PENDING):
            latest_metrics = {
                "loss": live_fields.get("loss"),
                "precision": live_fields.get("precision"),
                "recall": live_fields.get("recall"),
                "f1": live_fields.get("f1"),
                "map50": live_fields.get("map50"),
                "map50_95": live_fields.get("map50_95"),
            }

        jobs.append({
            "job_id": str(job.id),
            "project_id": str(job.project_id),
            "project_name": project_name,
            "name": job.name,
            "architecture": job.architecture.value,
            "status": job.status.value,
            "progress": live_fields["progress"],
            "current_epoch": live_fields["current_epoch"],
            "total_epochs": total_epochs,
            "phase": live_fields.get("phase"),
            "message": live_fields.get("message"),
            "batch": live_fields.get("batch"),
            "total_batches": live_fields.get("total_batches"),
            "epoch_progress": live_fields.get("epoch_progress"),
            "export_current": live_fields.get("export_current"),
            "export_total": live_fields.get("export_total"),
            "current_step": live_fields.get("current_step"),
            "total_steps": live_fields.get("total_steps"),
            "duration_seconds": duration,
            "eta_seconds": live_fields.get("eta_seconds"),
            "epoch_elapsed_seconds": live_fields.get("epoch_elapsed_seconds"),
            "epoch_eta_seconds": live_fields.get("epoch_eta_seconds"),
            "batches_per_min": live_fields.get("batches_per_min"),
            "sec_per_batch": live_fields.get("sec_per_batch"),
            "device_label": device_label,
            "latest_metrics": latest_metrics,
        })

    return jobs
