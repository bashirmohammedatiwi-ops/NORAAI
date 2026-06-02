import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ClassAuditLog, ClassLabel, ModelDefinition, Organization, Project


DEFAULT_CLASSES = [
    "حوادث",
    "حفر",
]

DEFAULT_MODELS = [
    "كشف حوادث",
    "كشف حفر",
]


async def list_projects(db: AsyncSession, org_id: uuid.UUID) -> list[Project]:
    result = await db.execute(
        select(Project)
        .where(Project.organization_id == org_id)
        .order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


def project_has_model(project: Project) -> bool:
    return project.active_model_artifact_id is not None


async def create_project(db: AsyncSession, org_id: uuid.UUID, data: dict) -> Project:
    project = Project(organization_id=org_id, **data)
    db.add(project)
    await db.flush()

    for cls_name in DEFAULT_CLASSES:
        db.add(ClassLabel(project_id=project.id, name=cls_name))

    for model_name in DEFAULT_MODELS:
        db.add(ModelDefinition(project_id=project.id, name=model_name, task_type="detection"))

    await db.flush()
    return project


async def merge_classes(
    db: AsyncSession,
    project_id: uuid.UUID,
    source_ids: list[uuid.UUID],
    target_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> None:
    from app.models import Annotation

    for source_id in source_ids:
        if source_id == target_id:
            continue
        result = await db.execute(
            select(Annotation).where(Annotation.class_id == source_id)
        )
        for ann in result.scalars().all():
            ann.class_id = target_id

        source = await db.get(ClassLabel, source_id)
        if source:
            source.is_archived = True

    db.add(
        ClassAuditLog(
            project_id=project_id,
            action="merge",
            details={"source_ids": [str(s) for s in source_ids], "target_id": str(target_id)},
            user_id=user_id,
        )
    )
