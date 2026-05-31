from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import ModelDefinition, Project, User
from app.schemas import (
    ModelDefinitionCreate,
    ModelDefinitionResponse,
    ProjectCreate,
    ProjectResponse,
)
from app.services.projects.service import create_project, list_projects

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def get_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await list_projects(db, user.organization_id)


@router.post("", response_model=ProjectResponse)
async def create_new_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_project(db, user.organization_id, data.model_dump())


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.organization_id == user.organization_id)
    )
    return result.scalar_one()


@router.get("/{project_id}/models", response_model=list[ModelDefinitionResponse])
async def get_models(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ModelDefinition).where(ModelDefinition.project_id == project_id))
    return list(result.scalars().all())


@router.post("/{project_id}/models", response_model=ModelDefinitionResponse)
async def add_model(project_id: UUID, data: ModelDefinitionCreate, db: AsyncSession = Depends(get_db)):
    model = ModelDefinition(project_id=project_id, **data.model_dump())
    db.add(model)
    await db.flush()
    return model
