from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, delete, func, or_, select
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
from app.schemas import AnnotationCreate, AnnotationResponse, AnnotationUpdate, AutoLabelRequest
from workers.labeling.tasks import auto_label_images

router = APIRouter(prefix="/annotation", tags=["annotation"])

_ACTIVE_STATUSES = (
    AnnotationStatus.APPROVED,
    AnnotationStatus.EDITED,
    AnnotationStatus.PENDING_REVIEW,
)


@router.get("/project/{project_id}/workspace")
async def annotation_workspace(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """Stats and per-image annotation summary for the labeling workspace."""
    from app.models import ClassLabel, Image

    classes_result = await db.execute(
        select(ClassLabel)
        .where(ClassLabel.project_id == project_id, ClassLabel.is_archived == False)
        .order_by(ClassLabel.name)
    )
    classes = [
        {"id": str(c.id), "name": c.name, "color": c.color or "#3B82F6"}
        for c in classes_result.scalars().all()
    ]

    images_result = await db.execute(
        select(Image.id, Image.filename, Image.created_at)
        .where(Image.project_id == project_id)
        .order_by(Image.created_at.desc())
        .limit(500)
    )
    image_rows = images_result.all()
    image_ids = [row[0] for row in image_rows]

    counts_by_image: dict[UUID, tuple[int, int]] = {}
    manual_by_image: dict[UUID, int] = {}
    if image_ids:
        agg = await db.execute(
            select(
                Annotation.image_id,
                func.count(Annotation.id),
                func.sum(
                    case(
                        (Annotation.status == AnnotationStatus.PENDING_REVIEW, 1),
                        else_=0,
                    )
                ),
            )
            .where(
                Annotation.image_id.in_(image_ids),
                Annotation.status.in_(_ACTIVE_STATUSES),
            )
            .group_by(Annotation.image_id)
        )
        for image_id, total, pending in agg.all():
            counts_by_image[image_id] = (int(total or 0), int(pending or 0))

        manual_agg = await db.execute(
            select(Annotation.image_id, func.count(Annotation.id))
            .where(
                Annotation.image_id.in_(image_ids),
                Annotation.status.in_(_ACTIVE_STATUSES),
                or_(
                    Annotation.source == "manual",
                    Annotation.status == AnnotationStatus.EDITED,
                ),
            )
            .group_by(Annotation.image_id)
        )
        for image_id, manual_count in manual_agg.all():
            manual_by_image[image_id] = int(manual_count or 0)

    pending_total = await db.execute(
        select(func.count(Annotation.id))
        .join(Image, Image.id == Annotation.image_id)
        .where(
            Image.project_id == project_id,
            Annotation.status == AnnotationStatus.PENDING_REVIEW,
        )
    )

    images_payload = []
    annotated = 0
    unannotated = 0
    manual_images = 0
    for image_id, filename, created_at in image_rows:
        total, pending = counts_by_image.get(image_id, (0, 0))
        manual_count = manual_by_image.get(image_id, 0)
        has_manual = manual_count > 0
        if total > 0:
            annotated += 1
        else:
            unannotated += 1
        if has_manual:
            manual_images += 1
        images_payload.append({
            "id": str(image_id),
            "filename": filename,
            "annotation_count": total,
            "manual_count": manual_count,
            "pending_count": pending,
            "has_labels": total > 0,
            "has_manual_labels": has_manual,
            "needs_review": pending > 0,
            "created_at": created_at.isoformat() if created_at else None,
        })

    return {
        "stats": {
            "total_images": len(image_rows),
            "annotated_images": annotated,
            "unannotated_images": unannotated,
            "manual_annotated_images": manual_images,
            "without_manual_images": len(image_rows) - manual_images,
            "pending_review": int(pending_total.scalar() or 0),
            "total_boxes": sum(c[0] for c in counts_by_image.values()),
        },
        "images": images_payload,
        "classes": classes,
    }


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
    from app.models import Image

    image = await db.get(Image, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
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


@router.patch("/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: UUID,
    data: AnnotationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ann = await db.get(Annotation, annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if data.class_id is not None:
        ann.class_id = data.class_id
    if data.x_center is not None:
        ann.x_center = data.x_center
    if data.y_center is not None:
        ann.y_center = data.y_center
    if data.width is not None:
        ann.width = max(0.01, min(1.0, data.width))
    if data.height is not None:
        ann.height = max(0.01, min(1.0, data.height))

    ann.status = AnnotationStatus.EDITED
    ann.source = "manual"
    db.add(AnnotationReview(annotation_id=annotation_id, reviewer_id=user.id, action="edit"))
    await db.flush()
    return ann


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ann = await db.get(Annotation, annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.execute(delete(AnnotationReview).where(AnnotationReview.annotation_id == annotation_id))
    await db.execute(delete(Annotation).where(Annotation.id == annotation_id))
    return {"status": "deleted"}


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
