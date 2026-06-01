from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, verify_user_password
from app.core.database import get_db
from app.models import ModelDefinition, Project, User
from app.schemas import (
    DeleteResultResponse,
    ModelDefinitionCreate,
    ModelDefinitionResponse,
    PasswordConfirmRequest,
    ProjectCreate,
    ProjectListItemResponse,
    ProjectOverviewResponse,
    ProjectResponse,
)
from app.services.deletion import delete_project_permanently
from app.services.models.active_model import get_active_model_status
from app.services.projects.service import create_project, list_projects, project_has_model

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectListItemResponse])
async def get_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    projects = await list_projects(db, user.organization_id)
    return [
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


@router.get("/{project_id}/overview", response_model=ProjectOverviewResponse)
async def get_project_overview(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.organization_id == user.organization_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    model_status = await get_active_model_status(db, project_id)
    return ProjectOverviewResponse(
        project=ProjectResponse.model_validate(project),
        model_status=model_status,
    )


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


@router.delete("/{project_id}", response_model=DeleteResultResponse)
async def delete_project(
    project_id: UUID,
    data: PasswordConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await delete_project_permanently(db, project_id, user.organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeleteResultResponse(
        deleted=result["deleted"],
        message=f"Project '{result['project_name']}' and all related data were permanently deleted.",
    )
