from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    ActiveLearningQueue,
    ActiveLearningStatus,
    Annotation,
    AnnotationReview,
    AnnotationStatus,
    User,
)
from app.schemas import AnnotationCreate, AnnotationResponse, AutoLabelRequest
from workers.labeling.tasks import auto_label_images

router = APIRouter(prefix="/annotation", tags=["annotation"])


@router.get("/project/{project_id}/pending")
async def pending_annotations(project_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.models import Image

    result = await db.execute(
        select(Annotation)
        .join(Image)
        .where(Image.project_id == project_id, Annotation.status == AnnotationStatus.PENDING_REVIEW)
        .limit(100)
    )
    return [
        {
            "id": str(a.id),
            "image_id": str(a.image_id),
            "class_id": str(a.class_id),
            "x_center": a.x_center,
            "y_center": a.y_center,
            "width": a.width,
            "height": a.height,
            "confidence": a.confidence,
            "status": a.status.value,
        }
        for a in result.scalars().all()
    ]


@router.get("/image/{image_id}")
async def list_image_annotations(image_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.models import ClassLabel, Image

    image = await db.get(Image, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    result = await db.execute(
        select(Annotation, ClassLabel)
        .join(ClassLabel, ClassLabel.id == Annotation.class_id)
        .where(
            Annotation.image_id == image_id,
            Annotation.status.in_(
                [AnnotationStatus.APPROVED, AnnotationStatus.EDITED, AnnotationStatus.PENDING_REVIEW]
            ),
        )
    )
    return [
        {
            "id": str(a.id),
            "image_id": str(a.image_id),
            "class_id": str(a.class_id),
            "class_name": cls.name,
            "class_color": cls.color,
            "x_center": a.x_center,
            "y_center": a.y_center,
            "width": a.width,
            "height": a.height,
            "confidence": a.confidence,
            "status": a.status.value,
            "source": a.source,
        }
        for a, cls in result.all()
    ]


@router.post("/image/{image_id}", response_model=AnnotationResponse)
async def create_annotation(
    image_id: UUID, data: AnnotationCreate, db: AsyncSession = Depends(get_db)
):
    ann = Annotation(
        image_id=image_id,
        class_id=data.class_id,
        x_center=data.x_center,
        y_center=data.y_center,
        width=data.width,
        height=data.height,
        status=AnnotationStatus.APPROVED,
        source="manual",
    )
    db.add(ann)
    await db.flush()
    return ann


@router.post("/{annotation_id}/approve")
async def approve_annotation(
    annotation_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    ann = await db.get(Annotation, annotation_id)
    ann.status = AnnotationStatus.APPROVED
    db.add(AnnotationReview(annotation_id=annotation_id, reviewer_id=user.id, action="approve"))
    return {"status": "approved"}


@router.post("/{annotation_id}/reject")
async def reject_annotation(
    annotation_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    ann = await db.get(Annotation, annotation_id)
    ann.status = AnnotationStatus.REJECTED
    db.add(AnnotationReview(annotation_id=annotation_id, reviewer_id=user.id, action="reject"))
    return {"status": "rejected"}


@router.post("/auto-label")
async def trigger_auto_label(data: AutoLabelRequest, db: AsyncSession = Depends(get_db)):
    from app.services.models.active_model import get_active_model

    model_id = data.model_artifact_id
    if not model_id:
        artifact = await get_active_model(db, data.project_id)
        if not artifact:
            raise HTTPException(status_code=400, detail="No active model. Train the project model first.")
        model_id = artifact.id

    task = auto_label_images.delay(
        str(data.project_id),
        [str(i) for i in data.image_ids],
        str(model_id),
    )
    return {"task_id": task.id, "status": "queued", "model_id": str(model_id)}


@router.get("/active-learning/{project_id}")
async def active_learning_queue(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ActiveLearningQueue)
        .where(
            ActiveLearningQueue.project_id == project_id,
            ActiveLearningQueue.status == ActiveLearningStatus.NEEDS_REVIEW,
        )
        .order_by(ActiveLearningQueue.uncertainty_score.desc())
        .limit(100)
    )
    return [
        {
            "id": str(q.id),
            "image_id": str(q.image_id),
            "uncertainty_score": q.uncertainty_score,
            "confidence": q.confidence,
            "status": q.status.value,
        }
        for q in result.scalars().all()
    ]


@router.post("/active-learning/{queue_id}/resolve")
async def resolve_active_learning(queue_id: UUID, db: AsyncSession = Depends(get_db)):
    item = await db.get(ActiveLearningQueue, queue_id)
    item.status = ActiveLearningStatus.RESOLVED
    return {"status": "resolved"}
