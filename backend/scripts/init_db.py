"""Initialize database with admin user and seed project."""

import asyncio
import uuid

from sqlalchemy import select

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


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        org_result = await db.execute(select(Organization).limit(1))
        org = org_result.scalar_one_or_none()
        if not org:
            org = Organization(name="AI Operations Center")
            db.add(org)
            await db.flush()

        user_result = await db.execute(select(User).where(User.email == settings.admin_email))
        admin = user_result.scalar_one_or_none()
        if not admin:
            admin = User(
                organization_id=org.id,
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                full_name="System Administrator",
                role=UserRole.ADMIN,
            )
            db.add(admin)
            await db.flush()
            print(f"Created admin user: {settings.admin_email}")

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
