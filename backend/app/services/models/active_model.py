"""Single active model per project — train continuously, all services use it."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import Deployment, DeploymentStatus, DeploymentTarget, ModelArtifact, ModelLifecycle, Project


MAIN_MODEL_NAME = "Main Model"
LIVE_DEPLOYMENT_NAME = "Live Model"


async def get_active_model(db: AsyncSession, project_id: uuid.UUID) -> ModelArtifact | None:
    project = await db.get(Project, project_id)
    if not project or not project.active_model_artifact_id:
        result = await db.execute(
            select(ModelArtifact)
            .where(
                ModelArtifact.project_id == project_id,
                ModelArtifact.lifecycle == ModelLifecycle.PRODUCTION,
            )
            .order_by(ModelArtifact.created_at.desc())
            .limit(1)
        )
        artifact = result.scalar_one_or_none()
        if artifact and project:
            project.active_model_artifact_id = artifact.id
        return artifact

    return await db.get(ModelArtifact, project.active_model_artifact_id)


def get_active_model_sync(session: Session, project_id: uuid.UUID) -> ModelArtifact | None:
    project = session.get(Project, project_id)
    if not project or not project.active_model_artifact_id:
        artifact = (
            session.query(ModelArtifact)
            .filter(
                ModelArtifact.project_id == project_id,
                ModelArtifact.lifecycle == ModelLifecycle.PRODUCTION,
            )
            .order_by(ModelArtifact.created_at.desc())
            .first()
        )
        if artifact and project:
            project.active_model_artifact_id = artifact.id
            session.flush()
        return artifact
    return session.get(ModelArtifact, project.active_model_artifact_id)


async def promote_as_active_model(db: AsyncSession, project_id: uuid.UUID, artifact_id: uuid.UUID) -> ModelArtifact:
    artifact = await db.get(ModelArtifact, artifact_id)
    if not artifact or artifact.project_id != project_id:
        raise ValueError("Invalid model artifact for project")

    await db.execute(
        update(ModelArtifact)
        .where(
            ModelArtifact.project_id == project_id,
            ModelArtifact.id != artifact_id,
            ModelArtifact.lifecycle == ModelLifecycle.PRODUCTION,
        )
        .values(lifecycle=ModelLifecycle.ARCHIVED)
    )

    artifact.lifecycle = ModelLifecycle.PRODUCTION
    artifact.name = MAIN_MODEL_NAME

    project = await db.get(Project, project_id)
    if project:
        project.active_model_artifact_id = artifact.id

    await db.flush()
    return artifact


def promote_as_active_model_sync(session: Session, project_id: uuid.UUID, artifact_id: uuid.UUID) -> ModelArtifact:
    artifact = session.get(ModelArtifact, artifact_id)
    if not artifact or artifact.project_id != project_id:
        raise ValueError("Invalid model artifact for project")

    session.query(ModelArtifact).filter(
        ModelArtifact.project_id == project_id,
        ModelArtifact.id != artifact_id,
        ModelArtifact.lifecycle == ModelLifecycle.PRODUCTION,
    ).update({ModelArtifact.lifecycle: ModelLifecycle.ARCHIVED})

    artifact.lifecycle = ModelLifecycle.PRODUCTION
    artifact.name = MAIN_MODEL_NAME

    project = session.get(Project, project_id)
    if project:
        project.active_model_artifact_id = artifact.id

    session.flush()
    return artifact


def ensure_live_deployment_sync(session: Session, project_id: uuid.UUID, artifact_id: uuid.UUID) -> Deployment:
    deployment = (
        session.query(Deployment)
        .filter(Deployment.project_id == project_id, Deployment.name == LIVE_DEPLOYMENT_NAME)
        .first()
    )

    endpoint = f"/api/v1/inference/project/{project_id}/predict"

    if deployment:
        deployment.model_artifact_id = artifact_id
        deployment.status = DeploymentStatus.ACTIVE
        deployment.target = DeploymentTarget.REST_API
        deployment.endpoint_url = endpoint
        deployment.deployed_at = datetime.now(timezone.utc)
    else:
        deployment = Deployment(
            project_id=project_id,
            model_artifact_id=artifact_id,
            name=LIVE_DEPLOYMENT_NAME,
            target=DeploymentTarget.REST_API,
            status=DeploymentStatus.ACTIVE,
            endpoint_url=endpoint,
            config={"auto": True, "single_model": True},
            deployed_at=datetime.now(timezone.utc),
        )
        session.add(deployment)

    session.flush()
    return deployment


async def get_active_model_status(db: AsyncSession, project_id: uuid.UUID) -> dict:
    from app.models import TrainingJob, TrainingStatus

    project = await db.get(Project, project_id)
    if not project:
        return {}

    if project.active_model_artifact_id:
        artifact = await db.get(ModelArtifact, project.active_model_artifact_id)
    else:
        result = await db.execute(
            select(ModelArtifact)
            .where(
                ModelArtifact.project_id == project_id,
                ModelArtifact.lifecycle == ModelLifecycle.PRODUCTION,
            )
            .order_by(ModelArtifact.created_at.desc())
            .limit(1)
        )
        artifact = result.scalar_one_or_none()
        if artifact:
            project.active_model_artifact_id = artifact.id

    running_job = await db.execute(
        select(TrainingJob)
        .where(
            TrainingJob.project_id == project_id,
            TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
        )
        .order_by(TrainingJob.created_at.desc())
        .limit(1)
    )
    job = running_job.scalar_one_or_none()

    deployment = await db.execute(
        select(Deployment).where(
            Deployment.project_id == project_id,
            Deployment.name == LIVE_DEPLOYMENT_NAME,
        )
    )
    dep = deployment.scalar_one_or_none()

    from app.core.config import get_settings
    from app.models import TrainingMetric

    settings = get_settings()
    training_info: dict = {
        "is_running": job is not None,
        "job_id": str(job.id) if job else None,
        "status": job.status.value if job else None,
        "name": job.name if job else None,
        "progress": 0,
        "current_epoch": 0,
        "total_epochs": 0,
        "device": "cpu" if settings.training_cpu_fallback else "gpu",
        "device_label": "CPU Training" if settings.training_cpu_fallback else "GPU Training",
    }
    if job:
        total_epochs = (job.config or {}).get("epochs", 50)
        training_info["total_epochs"] = total_epochs
        training_info["device"] = (job.config or {}).get("device", training_info["device"])
        latest_metric = await db.execute(
            select(TrainingMetric)
            .where(TrainingMetric.training_job_id == job.id)
            .order_by(TrainingMetric.epoch.desc())
            .limit(1)
        )
        latest = latest_metric.scalar_one_or_none()
        current_epoch = latest.epoch if latest else 0
        training_info["current_epoch"] = current_epoch
        training_info["progress"] = min(100, int((current_epoch / total_epochs) * 100)) if total_epochs else 0

    return {
        "project_id": str(project_id),
        "project_name": project.name,
        "has_model": artifact is not None,
        "can_fine_tune": bool(
            artifact
            and not (artifact.metrics or {}).get("mock")
            and artifact.architecture in ("yolo11", "yolov10", "rt_detr")
        ),
        "model": {
            "id": str(artifact.id),
            "name": artifact.name,
            "architecture": artifact.architecture,
            "lifecycle": artifact.lifecycle.value,
            "metrics": artifact.metrics or {},
            "classes_used": artifact.classes_used or [],
            "model_size_mb": artifact.model_size_mb,
            "gpu_used": artifact.gpu_used,
            "updated_at": artifact.created_at.isoformat(),
            "is_mock": bool((artifact.metrics or {}).get("mock")),
        }
        if artifact
        else None,
        "training": training_info,
        "live_endpoint": dep.endpoint_url if dep else None,
        "connected_services": [
            {"id": "dataset_builder", "name": "Dataset Builder", "uses": "training data"},
            {"id": "road_intelligence", "name": "Road Intelligence", "uses": "detections & events"},
            {"id": "fleet", "name": "Fleet Devices", "uses": "edge inference"},
            {"id": "annotation", "name": "Auto-Labeling", "uses": "active model weights"},
            {"id": "monitoring", "name": "Monitoring", "uses": "inference logs & drift"},
        ],
    }
