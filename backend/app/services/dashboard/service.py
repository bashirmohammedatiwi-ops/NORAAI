import asyncio
import uuid

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models import Deployment, DeploymentStatus, DriftAlert, FleetDevice, Image, Project, TrainingJob, TrainingStatus
from app.schemas import ProjectListItemResponse
from app.services.dashboard.active_training import fetch_active_training_jobs
from app.services.projects.service import list_projects, project_has_model


async def _fast_image_count(db: AsyncSession, org_id: uuid.UUID) -> int:
    """Exact org-scoped count; use global estimate only when org owns most data."""
    org_count = (
        await db.execute(
            select(func.count(Image.id))
            .join(Project, Project.id == Image.project_id)
            .where(Project.organization_id == org_id)
        )
    ).scalar() or 0

    if org_count < 10_000:
        return org_count

    try:
        estimate = (
            await db.execute(text("SELECT reltuples::bigint FROM pg_class WHERE relname = 'images'"))
        ).scalar()
        if estimate is not None and int(estimate) >= 10_000:
            return int(estimate)
    except Exception:
        pass
    return org_count


async def fetch_dashboard_stats(db: AsyncSession, org_id: uuid.UUID, *, include_images: bool = True) -> dict:
    total_projects = (
        await db.execute(select(func.count(Project.id)).where(Project.organization_id == org_id))
    ).scalar() or 0
    active_training = (
        await db.execute(
            select(func.count(TrainingJob.id))
            .join(Project, Project.id == TrainingJob.project_id)
            .where(
                Project.organization_id == org_id,
                TrainingJob.status == TrainingStatus.RUNNING,
            )
        )
    ).scalar() or 0
    deployed = (
        await db.execute(
            select(func.count(Deployment.id))
            .join(Project, Project.id == Deployment.project_id)
            .where(
                Project.organization_id == org_id,
                Deployment.status == DeploymentStatus.ACTIVE,
            )
        )
    ).scalar() or 0
    fleet = (
        await db.execute(
            select(func.count(FleetDevice.id))
            .join(Project, Project.id == FleetDevice.project_id)
            .where(
                Project.organization_id == org_id,
                FleetDevice.is_online == True,
            )
        )
    ).scalar() or 0
    images = await _fast_image_count(db, org_id) if include_images else 0
    alerts = (
        await db.execute(
            select(func.count(DriftAlert.id))
            .join(Deployment, Deployment.id == DriftAlert.deployment_id)
            .join(Project, Project.id == Deployment.project_id)
            .where(
                Project.organization_id == org_id,
                DriftAlert.is_acknowledged == False,
            )
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


async def _fetch_dashboard_stats_for_org(org_id: uuid.UUID, *, include_images: bool) -> dict:
    async with async_session() as db:
        return await fetch_dashboard_stats(db, org_id, include_images=include_images)


async def _fetch_active_training_for_org(org_id: uuid.UUID) -> list[dict]:
    async with async_session() as db:
        return await fetch_active_training_jobs(db, org_id)


async def fetch_dashboard_home(db: AsyncSession, org_id: uuid.UUID) -> dict:
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

    stats, active_training = await asyncio.gather(
        _fetch_dashboard_stats_for_org(org_id, include_images=False),
        _fetch_active_training_for_org(org_id),
    )

    return {"stats": stats, "projects": project_items, "active_training": active_training}
