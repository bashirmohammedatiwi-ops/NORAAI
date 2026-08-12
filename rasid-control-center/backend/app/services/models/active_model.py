import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ModelArtifact, ModelLifecycle, Project


async def get_active_model(db: AsyncSession, project_id: uuid.UUID) -> ModelArtifact | None:
    project = await db.get(Project, project_id)
    if not project or not project.active_model_artifact_id:
        return None
    artifact = await db.get(ModelArtifact, project.active_model_artifact_id)
    if artifact and artifact.project_id == project_id:
        return artifact
    return None


async def promote_as_active_model(db: AsyncSession, project_id: uuid.UUID, model_id: uuid.UUID) -> ModelArtifact:
    artifact = await db.get(ModelArtifact, model_id)
    if not artifact or artifact.project_id != project_id:
        raise ValueError("Model not found")
    artifact.lifecycle = ModelLifecycle.PRODUCTION
    project = await db.get(Project, project_id)
    if project:
        project.active_model_artifact_id = model_id
    await db.flush()
    return artifact
