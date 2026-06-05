"""Prevent overlapping training jobs on the same project (single worker)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import TrainingJob, TrainingStatus


def _running_job_query(project_id: uuid.UUID):
    return select(TrainingJob).where(
        TrainingJob.project_id == project_id,
        TrainingJob.status.in_([TrainingStatus.PENDING, TrainingStatus.RUNNING]),
    )


async def ensure_no_running_training_async(db: AsyncSession, project_id: uuid.UUID) -> None:
    from fastapi import HTTPException

    result = await db.execute(_running_job_query(project_id).limit(1))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="تدريب قيد التشغيل بالفعل — انتظر انتهاءه أو أوقفه قبل بدء تدريب جديد",
        )


def ensure_no_running_training_sync(session: Session, project_id: uuid.UUID) -> None:
    if session.execute(_running_job_query(project_id).limit(1)).scalar_one_or_none():
        raise RuntimeError("Training already in progress for this project")
