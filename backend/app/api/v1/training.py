from datetime import datetime, timezone

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, verify_user_password
from app.core.config import get_settings
from app.core.database import get_db
from app.models import ClassLabel, HyperparameterTrial, ModelArchitecture, ModelArtifact, TrainingJob, TrainingMetric, TrainingMode, TrainingStatus, User
from app.services.datasets.dataset_images import ensure_default_dataset, get_dataset_summary
from app.services.models.active_model import get_active_model_status
from app.services.models.deletion import delete_all_project_models, delete_model_artifact
from app.schemas import DeleteResultResponse, ModelArtifactResponse, ModelCompareRequest, PasswordConfirmRequest, TrainingJobCreate, TrainingJobResponse
from app.services.evaluation.compare import compare_models
from app.services.training.cpu_presets import DEFAULT_CPU_PRESET, build_retrain_config
from app.services.training.cancellation import request_training_cancel
from app.services.training.service import TRAINING_OPTIONS, get_job_detail, job_to_summary
from workers.celery_app import celery_app
from workers.training.tasks import cancel_training_job, run_training_job

router = APIRouter(tags=["training", "models"])


@router.get("/training/options")
async def get_training_options():
    return TRAINING_OPTIONS


@router.get("/training/project/{project_id}", response_model=list[TrainingJobResponse])
async def list_training_jobs(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingJob).where(TrainingJob.project_id == project_id).order_by(TrainingJob.created_at.desc())
    )
    jobs = result.scalars().all()
    summaries = []
    for j in jobs:
        summary = await job_to_summary(db, j)
        summaries.append(TrainingJobResponse(**summary))
    return summaries


@router.get("/training/{job_id}")
async def get_training_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    detail = await get_job_detail(db, job_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Training job not found")
    return detail


@router.post("/training/project/{project_id}", response_model=TrainingJobResponse)
async def create_training_job(
    project_id: UUID,
    data: TrainingJobCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = TrainingJob(
        project_id=project_id,
        name=data.name,
        architecture=ModelArchitecture(data.architecture),
        training_mode=TrainingMode(data.training_mode),
        model_definition_id=data.model_definition_id,
        dataset_version_id=data.dataset_version_id,
        hpo_enabled=data.hpo_enabled,
        config=data.config,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    try:
        task = run_training_job.delay(str(job.id))
    except Exception as exc:
        job.status = TrainingStatus.FAILED
        job.error_message = f"Training worker unavailable: {exc}"
        await db.flush()
        raise HTTPException(
            status_code=503,
            detail="Training worker is not available. Check worker-training container and Redis.",
        ) from exc
    job.celery_task_id = task.id
    await db.flush()

    return TrainingJobResponse(
        id=job.id,
        name=job.name,
        architecture=job.architecture.value,
        status=job.status.value,
        hpo_enabled=job.hpo_enabled,
        created_at=job.created_at,
    )


@router.post("/training/{job_id}/cancel")
async def cancel_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(TrainingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in (TrainingStatus.PENDING, TrainingStatus.RUNNING):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in status {job.status.value}")

    request_training_cancel(str(job_id))
    if job.celery_task_id:
        celery_app.control.revoke(job.celery_task_id, terminate=True, signal="SIGTERM")

    job.status = TrainingStatus.CANCELLED
    job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    cancel_training_job.delay(str(job_id))
    return {"status": "cancelled", "job_id": str(job_id)}


@router.get("/training/{job_id}/metrics")
async def get_training_metrics(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingMetric).where(TrainingMetric.training_job_id == job_id).order_by(TrainingMetric.epoch)
    )
    return [
        {
            "epoch": m.epoch,
            "loss": m.loss,
            "precision": m.precision,
            "recall": m.recall,
            "f1": m.f1,
            "map50": m.map50,
            "map50_95": m.map50_95,
        }
        for m in result.scalars().all()
    ]


@router.get("/training/{job_id}/trials")
async def get_hpo_trials(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HyperparameterTrial)
        .where(HyperparameterTrial.training_job_id == job_id)
        .order_by(HyperparameterTrial.trial_number)
    )
    return [
        {
            "id": str(t.id),
            "trial_number": t.trial_number,
            "params": t.params,
            "metrics": t.metrics,
            "status": t.status,
            "is_best": t.is_best,
        }
        for t in result.scalars().all()
    ]


@router.get("/models/project/{project_id}", response_model=list[ModelArtifactResponse])
async def list_models(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ModelArtifact).where(ModelArtifact.project_id == project_id).order_by(ModelArtifact.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/models/{model_id}", response_model=ModelArtifactResponse)
async def get_model(model_id: UUID, db: AsyncSession = Depends(get_db)):
    model = await db.get(ModelArtifact, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.get("/training/project/{project_id}/environment")
async def training_environment(project_id: UUID):
    settings = get_settings()
    return {
        "project_id": str(project_id),
        "device": "cpu" if settings.training_cpu_fallback else "gpu",
        "cpu_fallback": settings.training_cpu_fallback,
        "label": "CPU Training" if settings.training_cpu_fallback else "GPU Training",
    }


@router.delete("/models/{model_id}", response_model=DeleteResultResponse)
async def remove_model(
    model_id: UUID,
    data: PasswordConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await delete_model_artifact(db, model_id, user.organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeleteResultResponse(deleted=result["deleted"], message=f"Model '{result['model_name']}' deleted.")


@router.delete("/projects/{project_id}/models", response_model=DeleteResultResponse)
async def remove_all_project_models(
    project_id: UUID,
    data: PasswordConfirmRequest,
    delete_jobs: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await delete_all_project_models(
            db, project_id, user.organization_id, delete_jobs=delete_jobs
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    msg = f"Removed {result['models_removed']} model(s) from project."
    if result.get("jobs_removed"):
        msg += f" Deleted {result['jobs_removed']} training job(s)."
    return DeleteResultResponse(deleted=result["deleted"], message=msg)


@router.patch("/models/{model_id}/lifecycle")
async def update_model_lifecycle(model_id: UUID, lifecycle: str, db: AsyncSession = Depends(get_db)):
    from app.models import ModelLifecycle
    model = await db.get(ModelArtifact, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    model.lifecycle = ModelLifecycle(lifecycle)
    return {"id": str(model.id), "lifecycle": model.lifecycle.value}


@router.post("/models/compare")
async def compare_model_artifacts(data: ModelCompareRequest, db: AsyncSession = Depends(get_db)):
    return await compare_models(db, data.model_ids)


@router.get("/projects/{project_id}/active-model")
async def project_active_model(project_id: UUID, db: AsyncSession = Depends(get_db)):
    status = await get_active_model_status(db, project_id)
    if not status:
        raise HTTPException(status_code=404, detail="Project not found")
    return status


@router.post("/training/project/{project_id}/retrain", response_model=TrainingJobResponse)
async def retrain_project_model(
    project_id: UUID,
    epochs: int | None = Query(None, ge=5, le=200),
    architecture: str = Query("yolo11"),
    preset: str = Query(DEFAULT_CPU_PRESET, pattern="^(turbo_cpu|fast_cpu|balanced)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrain the single project model on the latest dataset — no manual model selection."""
    from app.models import Dataset, TrainingStatus

    running = await db.execute(
        select(TrainingJob).where(
            TrainingJob.project_id == project_id,
            TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
        )
    )
    if running.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Training already in progress")

    dataset = await ensure_default_dataset(db, project_id)
    summary = await get_dataset_summary(db, dataset.id)
    if not summary or summary.get("image_count", 0) < 1:
        raise HTTPException(status_code=400, detail="No images in dataset. Upload via Dataset Builder first.")

    head_version_id = summary.get("head_version_id")
    if not head_version_id:
        raise HTTPException(status_code=400, detail="Dataset has no version")

    config = build_retrain_config(epochs, preset)

    job = TrainingJob(
        project_id=project_id,
        name="Retrain Main Model",
        architecture=ModelArchitecture(architecture),
        training_mode=TrainingMode.SINGLE_GPU,
        dataset_version_id=UUID(head_version_id) if isinstance(head_version_id, str) else head_version_id,
        hpo_enabled=False,
        config=config,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    try:
        task = run_training_job.delay(str(job.id))
    except Exception as exc:
        job.status = TrainingStatus.FAILED
        job.error_message = f"Training worker unavailable: {exc}"
        await db.flush()
        raise HTTPException(
            status_code=503,
            detail="Training worker is not available. Check worker-training container and Redis.",
        ) from exc
    job.celery_task_id = task.id
    await db.flush()

    return TrainingJobResponse(
        id=job.id,
        name=job.name,
        architecture=job.architecture.value,
        status=job.status.value,
        hpo_enabled=job.hpo_enabled,
        created_at=job.created_at,
    )
