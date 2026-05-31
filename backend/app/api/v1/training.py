from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import HyperparameterTrial, ModelArchitecture, ModelArtifact, TrainingJob, TrainingMetric, TrainingMode, TrainingStatus, User
from app.schemas import ModelArtifactResponse, ModelCompareRequest, TrainingJobCreate, TrainingJobResponse
from app.services.evaluation.compare import compare_models
from app.services.training.service import TRAINING_OPTIONS, get_job_detail
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
    return [
        TrainingJobResponse(
            id=j.id,
            name=j.name,
            architecture=j.architecture.value,
            status=j.status.value,
            hpo_enabled=j.hpo_enabled,
            created_at=j.created_at,
            error_message=j.error_message,
        )
        for j in jobs
    ]


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

    task = run_training_job.delay(str(job.id))
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
    cancel_training_job.delay(str(job_id))
    job.status = TrainingStatus.CANCELLED
    return {"status": "cancelled"}


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
