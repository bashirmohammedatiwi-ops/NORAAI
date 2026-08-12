from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.schemas import ProjectResponse
from app.core.database import get_db
from app.models import Project, User

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def get_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.organization_id == user.organization_id).order_by(Project.created_at)
    )
    projects = list(result.scalars().all())
    return [
        ProjectResponse(id=str(p.id), name=p.name, description=p.description)
        for p in projects
    ]
