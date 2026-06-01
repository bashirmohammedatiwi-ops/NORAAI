import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models import Deployment, DeploymentStatus, DriftAlert, FleetDevice, Image, Project, TrainingJob, TrainingStatus
from app.schemas import ProjectListItemResponse
from app.services.projects.service import list_projects, project_has_model


async def _scalar_count(query) -> int:
    async with async_session() as db:
        result = await db.execute(query)
        return result.scalar() or 0


async def fetch_dashboard_stats() -> dict:
    projects_q = select(func.count(Project.id))
    training_q = select(func.count(TrainingJob.id)).where(TrainingJob.status == TrainingStatus.RUNNING)
    deployed_q = select(func.count(Deployment.id)).where(Deployment.status == DeploymentStatus.ACTIVE)
    fleet_q = select(func.count(FleetDevice.id)).where(FleetDevice.is_online == True)
    images_q = select(func.count(Image.id))
    alerts_q = select(func.count(DriftAlert.id)).where(DriftAlert.is_acknowledged == False)

    total_projects, active_training, deployed, fleet, images, alerts = await asyncio.gather(
        _scalar_count(projects_q),
        _scalar_count(training_q),
        _scalar_count(deployed_q),
        _scalar_count(fleet_q),
        _scalar_count(images_q),
        _scalar_count(alerts_q),
    )

    return {
        "total_projects": total_projects,
        "active_training_jobs": active_training,
        "deployed_models": deployed,
        "fleet_devices_online": fleet,
        "images_ingested": images,
        "alerts_active": alerts,
    }


async def fetch_dashboard_home(db: AsyncSession, org_id) -> dict:
    stats_task = fetch_dashboard_stats()
    projects = await list_projects(db, org_id)
    stats = await stats_task

    return {
        "stats": stats,
        "projects": [
            ProjectListItemResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                domain=p.domain,
                created_at=p.created_at,
                has_model=project_has_model(p),
            )
            for p in projects
        ],
    }
