"""Delete model artifacts and reset project model slot."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Deployment, EvaluationResult, InferenceLog, ModelArtifact, Project, TrainingJob, TrainingStatus
from app.services.deletion import _delete_minio_key


async def _clear_active_if_needed(db: AsyncSession, project: Project, artifact_id: uuid.UUID) -> None:
    if project.active_model_artifact_id == artifact_id:
        project.active_model_artifact_id = None


async def delete_model_artifact(
    db: AsyncSession,
    artifact_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> dict:
    artifact = await db.get(ModelArtifact, artifact_id)
    if not artifact:
        raise ValueError("Model not found")

    project = await db.get(Project, artifact.project_id)
    if not project or project.organization_id != organization_id:
        raise ValueError("Model not found")

    running = await db.execute(
        select(TrainingJob).where(
            TrainingJob.project_id == project.id,
            TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
        )
    )
    if running.scalar_one_or_none():
        raise ValueError("Cannot delete model while training is in progress")

    await _clear_active_if_needed(db, project, artifact.id)

    deployments = await db.execute(
        select(Deployment).where(Deployment.model_artifact_id == artifact.id)
    )
    for dep in deployments.scalars().all():
        await db.execute(delete(InferenceLog).where(InferenceLog.deployment_id == dep.id))
        await db.delete(dep)

    await db.execute(delete(EvaluationResult).where(EvaluationResult.model_artifact_id == artifact.id))

    _delete_minio_key(artifact.minio_weights_key)
    _delete_minio_key(artifact.minio_onnx_key or "")

    name = artifact.name
    await db.execute(delete(ModelArtifact).where(ModelArtifact.id == artifact.id))
    await db.flush()

    return {
        "deleted": "model",
        "model_id": str(artifact_id),
        "model_name": name,
    }


async def delete_all_project_models(
    db: AsyncSession,
    project_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    delete_jobs: bool = False,
) -> dict:
    project = await db.get(Project, project_id)
    if not project or project.organization_id != organization_id:
        raise ValueError("Project not found")

    running = await db.execute(
        select(TrainingJob).where(
            TrainingJob.project_id == project_id,
            TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
        )
    )
    if running.scalar_one_or_none():
        raise ValueError("Cannot delete models while training is in progress")

    project.active_model_artifact_id = None

    artifacts = await db.execute(select(ModelArtifact).where(ModelArtifact.project_id == project_id))
    artifact_list = list(artifacts.scalars().all())
    artifact_ids = [a.id for a in artifact_list]

    if artifact_ids:
        await db.execute(delete(EvaluationResult).where(EvaluationResult.model_artifact_id.in_(artifact_ids)))
        for art in artifact_list:
            _delete_minio_key(art.minio_weights_key)
            _delete_minio_key(art.minio_onnx_key or "")

        dep_result = await db.execute(select(Deployment).where(Deployment.project_id == project_id))
        for dep in dep_result.scalars().all():
            await db.execute(delete(InferenceLog).where(InferenceLog.deployment_id == dep.id))
            await db.delete(dep)

        await db.execute(delete(ModelArtifact).where(ModelArtifact.id.in_(artifact_ids)))

    jobs_removed = 0
    if delete_jobs:
        from app.models import HyperparameterTrial, TrainingMetric

        job_ids = [
            row[0]
            for row in (await db.execute(select(TrainingJob.id).where(TrainingJob.project_id == project_id))).all()
        ]
        if job_ids:
            await db.execute(delete(TrainingMetric).where(TrainingMetric.training_job_id.in_(job_ids)))
            await db.execute(delete(HyperparameterTrial).where(HyperparameterTrial.training_job_id.in_(job_ids)))
            jobs_removed = (await db.execute(delete(TrainingJob).where(TrainingJob.id.in_(job_ids)))).rowcount or 0

    await db.flush()

    return {
        "deleted": "project_models",
        "project_id": str(project_id),
        "models_removed": len(artifact_ids),
        "jobs_removed": jobs_removed,
    }
