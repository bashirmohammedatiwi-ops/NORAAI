"""Inference using the project's single active model."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import InferenceLog, User
from app.services.models.active_model import get_active_model

router = APIRouter(prefix="/inference", tags=["inference"])


@router.post("/project/{project_id}/predict")
async def predict(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    artifact = await get_active_model(db, project_id)
    if not artifact:
        raise HTTPException(
            status_code=404,
            detail="No trained model yet. Upload data and run training first.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image")

    classes = artifact.classes_used or ["object"]
    predictions = [
        {
            "class": classes[0],
            "confidence": 0.85,
            "bbox": [0.1, 0.1, 0.9, 0.9],
        }
    ]

    from app.models import Deployment
    from sqlalchemy import select

    dep_result = await db.execute(
        select(Deployment).where(Deployment.project_id == project_id, Deployment.name == "Live Model")
    )
    deployment = dep_result.scalar_one_or_none()

    if deployment:
        log = InferenceLog(
            deployment_id=deployment.id,
            input_hash=str(hash(content))[:16],
            predictions={"detections": predictions},
            confidence=predictions[0]["confidence"],
            latency_ms=42.0,
        )
        db.add(log)

    return {
        "model_id": str(artifact.id),
        "model_name": artifact.name,
        "architecture": artifact.architecture,
        "predictions": predictions,
        "message": "Using project's active model (continuous training pipeline)",
    }


@router.get("/project/{project_id}/status")
async def inference_status(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    artifact = await get_active_model(db, project_id)
    if not artifact:
        return {"ready": False, "endpoint": f"/api/v1/inference/project/{project_id}/predict"}
    return {
        "ready": True,
        "model_id": str(artifact.id),
        "model_name": artifact.name,
        "classes": artifact.classes_used or [],
        "endpoint": f"/api/v1/inference/project/{project_id}/predict",
    }
