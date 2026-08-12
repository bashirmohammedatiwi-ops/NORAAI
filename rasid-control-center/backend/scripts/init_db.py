import asyncio
import sys
import traceback
import uuid

from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.database import Base, async_session, engine
from app.core.db_migrate import ensure_road_event_enum
from app.core.security import hash_password

# Register all ORM tables before create_all
import app.models  # noqa: F401
from app.models import Organization, Project, User, UserRole
from app.services.demo.iraq_demo_seed import seed_iraq_demo_for_default_project

ROAD_PROJECT = {
    "name": "Road Infrastructure Monitoring",
    "description": "NURAI Dashboard — Iraq road intelligence",
    "domain": "road_infrastructure",
}


async def wait_for_db(max_attempts: int = 30) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except Exception as exc:
            if attempt == max_attempts:
                raise exc
            print(f"Waiting for postgres ({attempt}/{max_attempts})...")
            await asyncio.sleep(2)


async def init_db() -> None:
    settings = get_settings()
    await wait_for_db()

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        print(f"create_all warning: {exc}", file=sys.stderr)

    try:
        await ensure_road_event_enum()
    except Exception as exc:
        print(f"enum migrate warning: {exc}", file=sys.stderr)

    project_id_for_seed: uuid.UUID | None = None

    try:
        async with async_session() as db:
            org_result = await db.execute(select(Organization).limit(1))
            org = org_result.scalar_one_or_none()
            if not org:
                org = Organization(name="NURAI Operations")
                db.add(org)
                await db.flush()

            user_result = await db.execute(select(User).where(User.email == settings.admin_email))
            admin = user_result.scalar_one_or_none()
            if not admin:
                admin = User(
                    organization_id=org.id,
                    email=settings.admin_email,
                    hashed_password=hash_password(settings.admin_password),
                    full_name="NURAI Admin",
                    role=UserRole.ADMIN,
                )
                db.add(admin)
                await db.flush()
                print(f"Created admin: {settings.admin_email}")

            project_result = await db.execute(
                select(Project).where(Project.name == ROAD_PROJECT["name"], Project.organization_id == org.id)
            )
            project = project_result.scalar_one_or_none()
            if not project:
                project = Project(
                    organization_id=org.id,
                    name=ROAD_PROJECT["name"],
                    description=ROAD_PROJECT["description"],
                    domain=ROAD_PROJECT["domain"],
                )
                db.add(project)
                await db.flush()
                print(f"Created project: {project.name}")

            project_id_for_seed = project.id
            await db.commit()
    except Exception as exc:
        print(f"Admin/project setup error: {exc}", file=sys.stderr)
        traceback.print_exc()

    try:
        async with async_session() as db:
            from app.services.demo.iraq_demo_seed import seed_iraq_demo

            if project_id_for_seed:
                seed_result = await seed_iraq_demo(db, project_id_for_seed)
            else:
                seed_result = await seed_iraq_demo_for_default_project(db)
            if seed_result:
                await db.commit()
                print(f"Demo seed: {seed_result}")
    except Exception as exc:
        print(f"Demo seed skipped: {exc}", file=sys.stderr)
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(init_db())
