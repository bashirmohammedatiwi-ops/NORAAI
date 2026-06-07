"""Model registry helpers for listing and numbering trained artifacts."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import ModelArtifact, Project
from app.schemas import ModelArtifactResponse


def assign_model_numbers(artifacts: list[ModelArtifact]) -> dict[uuid.UUID, int]:
    """Assign stable #1..#N numbers by training order (oldest first)."""
    ordered = sorted(artifacts, key=lambda a: (a.created_at, str(a.id)))
    return {artifact.id: index for index, artifact in enumerate(ordered, start=1)}


async def list_project_model_artifacts(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> list[ModelArtifactResponse]:
    result = await db.execute(
        select(ModelArtifact)
        .where(ModelArtifact.project_id == project_id)
        .order_by(ModelArtifact.created_at.desc())
    )
    artifacts = list(result.scalars().all())
    numbers = assign_model_numbers(artifacts)
    project = await db.get(Project, project_id)
    active_id = project.active_model_artifact_id if project else None

    return [
        ModelArtifactResponse.from_artifact(
            artifact,
            model_number=numbers.get(artifact.id, 0),
            is_active=artifact.id == active_id,
        )
        for artifact in artifacts
    ]


def list_project_model_artifacts_sync(
    session: Session,
    project_id: uuid.UUID,
) -> list[ModelArtifactResponse]:
    artifacts = (
        session.query(ModelArtifact)
        .filter(ModelArtifact.project_id == project_id)
        .order_by(ModelArtifact.created_at.desc())
        .all()
    )
    numbers = assign_model_numbers(artifacts)
    project = session.get(Project, project_id)
    active_id = project.active_model_artifact_id if project else None

    return [
        ModelArtifactResponse.from_artifact(
            artifact,
            model_number=numbers.get(artifact.id, 0),
            is_active=artifact.id == active_id,
        )
        for artifact in artifacts
    ]
