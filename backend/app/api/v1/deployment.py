from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deployment, DeploymentStatus, DeploymentTarget, DriftAlert, InferenceLog
from app.schemas import DeploymentCreate, DeploymentResponse
from workers.deploy.tasks import deploy_model

router = APIRouter(tags=["deployment", "monitoring"])


@router.get("/deployments/project/{project_id}", response_model=list[DeploymentResponse])
async def list_deployments(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Deployment).where(Deployment.project_id == project_id).order_by(Deployment.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/deployments/project/{project_id}", response_model=DeploymentResponse)
async def create_deployment(
    project_id: UUID, data: DeploymentCreate, db: AsyncSession = Depends(get_db)
):
    deployment = Deployment(
        project_id=project_id,
        model_artifact_id=data.model_artifact_id,
        name=data.name,
        target=DeploymentTarget(data.target),
        status=DeploymentStatus.TESTING,
        config=data.config,
    )
    db.add(deployment)
    await db.flush()

    task = deploy_model.delay(str(deployment.id))
    deployment.celery_task_id = task.id
    await db.flush()
    return deployment


@router.patch("/deployments/{deployment_id}/status")
async def update_deployment_status(
    deployment_id: UUID, status: str, db: AsyncSession = Depends(get_db)
):
    deployment = await db.get(Deployment, deployment_id)
    deployment.status = DeploymentStatus(status)
    return {"status": deployment.status.value}


@router.get("/monitoring/{deployment_id}/logs")
async def inference_logs(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InferenceLog)
        .where(InferenceLog.deployment_id == deployment_id)
        .order_by(InferenceLog.created_at.desc())
        .limit(100)
    )
    return [
        {
            "id": str(l.id),
            "confidence": l.confidence,
            "latency_ms": l.latency_ms,
            "is_false_positive": l.is_false_positive,
            "is_false_negative": l.is_false_negative,
            "created_at": l.created_at.isoformat(),
        }
        for l in result.scalars().all()
    ]


@router.get("/monitoring/{deployment_id}/alerts")
async def drift_alerts(deployment_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DriftAlert)
        .where(DriftAlert.deployment_id == deployment_id)
        .order_by(DriftAlert.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id": str(a.id),
            "alert_type": a.alert_type.value,
            "severity": a.severity,
            "message": a.message,
            "is_acknowledged": a.is_acknowledged,
            "created_at": a.created_at.isoformat(),
        }
        for a in result.scalars().all()
    ]


@router.post("/monitoring/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: UUID, db: AsyncSession = Depends(get_db)):
    alert = await db.get(DriftAlert, alert_id)
    alert.is_acknowledged = True
    return {"status": "acknowledged"}
