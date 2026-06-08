"""Initialize database with admin user and seed project."""

import asyncio
import uuid

from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.database import async_session, engine, Base
from app.core.security import hash_password
from app.models.base_models import UserRole
from app.models import Organization, Project, User
from app.services.projects.service import create_project

settings = get_settings()

ROAD_PROJECT = {
    "name": "Road Infrastructure Monitoring",
    "description": "Smart road infrastructure and traffic monitoring AI project",
    "domain": "road_infrastructure",
}

PERFORMANCE_INDEXES = (
    "CREATE INDEX IF NOT EXISTS ix_projects_organization_id ON projects (organization_id)",
    "CREATE INDEX IF NOT EXISTS ix_training_jobs_project_id ON training_jobs (project_id)",
    "CREATE INDEX IF NOT EXISTS ix_training_jobs_status ON training_jobs (status)",
    "CREATE INDEX IF NOT EXISTS ix_training_metrics_job_epoch ON training_metrics (training_job_id, epoch)",
    "CREATE INDEX IF NOT EXISTS ix_deployments_project_id ON deployments (project_id)",
    "CREATE INDEX IF NOT EXISTS ix_deployments_status ON deployments (status)",
    "CREATE INDEX IF NOT EXISTS ix_fleet_devices_project_id ON fleet_devices (project_id)",
    "CREATE INDEX IF NOT EXISTS ix_fleet_devices_is_online ON fleet_devices (is_online)",
    "CREATE INDEX IF NOT EXISTS ix_drift_alerts_deployment_id ON drift_alerts (deployment_id)",
    "CREATE INDEX IF NOT EXISTS ix_drift_alerts_is_acknowledged ON drift_alerts (is_acknowledged)",
)


async def init_db():
    async with engine.connect() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            await conn.commit()
        except Exception as exc:
            await conn.rollback()
            print(f"PostGIS extension skipped (native dev OK): {exc}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS active_model_artifact_id UUID "
                "REFERENCES model_artifacts(id)"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS driver_model_artifact_id UUID "
                "REFERENCES model_artifacts(id)"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS mobile_config JSONB "
                "NOT NULL DEFAULT '{}'::jsonb"
            )
        )
        for index_sql in PERFORMANCE_INDEXES:
            await conn.execute(text(index_sql))

    async with async_session() as db:
        org_result = await db.execute(select(Organization).limit(1))
        org = org_result.scalar_one_or_none()
        if not org:
            org = Organization(name="AI Operations Center")
            db.add(org)
            await db.flush()

        target_email = (
            "admin@aiops.com"
            if settings.admin_email == "admin@aiops.local"
            else settings.admin_email
        )

        legacy_result = await db.execute(select(User).where(User.email == "admin@aiops.local"))
        admin = legacy_result.scalar_one_or_none()
        if admin and admin.email != target_email:
            admin.email = target_email
            print(f"Migrated admin email to {target_email}")

        if not admin:
            user_result = await db.execute(select(User).where(User.email == target_email))
            admin = user_result.scalar_one_or_none()

        if not admin:
            admin = User(
                organization_id=org.id,
                email=target_email,
                hashed_password=hash_password(settings.admin_password),
                full_name="System Administrator",
                role=UserRole.ADMIN,
            )
            db.add(admin)
            await db.flush()
            print(f"Created admin user: {target_email}")

        project_result = await db.execute(
            select(Project).where(Project.name == ROAD_PROJECT["name"])
        )
        project = project_result.scalar_one_or_none()
        if not project:
            project = await create_project(db, org.id, ROAD_PROJECT)
            print(f"Created seed project: {ROAD_PROJECT['name']}")

        await db.commit()
        print("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(init_db())
