from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models import Deployment, DeploymentStatus, DriftAlert, FleetDevice, Image, Project, TrainingJob, TrainingStatus
from app.schemas import ProjectListItemResponse
from app.services.projects.service import list_projects, project_has_model


async def _fast_image_count(db: AsyncSession) -> int:
    """Use PostgreSQL estimate for large tables; exact count for small ones."""
    try:
        estimate = (
            await db.execute(text("SELECT reltuples::bigint FROM pg_class WHERE relname = 'images'"))
        ).scalar()
        if estimate is not None and int(estimate) >= 10_000:
            return int(estimate)
    except Exception:
        pass
    return (await db.execute(select(func.count(Image.id)))).scalar() or 0


async def fetch_dashboard_stats() -> dict:
    async with async_session() as db:
        total_projects = (await db.execute(select(func.count(Project.id)))).scalar() or 0
        active_training = (
            await db.execute(
                select(func.count(TrainingJob.id)).where(TrainingJob.status == TrainingStatus.RUNNING)
            )
        ).scalar() or 0
        deployed = (
            await db.execute(
                select(func.count(Deployment.id)).where(Deployment.status == DeploymentStatus.ACTIVE)
            )
        ).scalar() or 0
        fleet = (
            await db.execute(
                select(func.count(FleetDevice.id)).where(FleetDevice.is_online == True)
            )
        ).scalar() or 0
        images = await _fast_image_count(db)
        alerts = (
            await db.execute(
                select(func.count(DriftAlert.id)).where(DriftAlert.is_acknowledged == False)
            )
        ).scalar() or 0

    return {
        "total_projects": total_projects,
        "active_training_jobs": active_training,
        "deployed_models": deployed,
        "fleet_devices_online": fleet,
        "images_ingested": images,
        "alerts_active": alerts,
    }


async def fetch_dashboard_home(db: AsyncSession, org_id) -> dict:
    projects = await list_projects(db, org_id)
    project_items = [
        ProjectListItemResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            domain=p.domain,
            created_at=p.created_at,
            has_model=project_has_model(p),
        )
        for p in projects
    ]
    stats = await fetch_dashboard_stats()
    return {"stats": stats, "projects": project_items}
