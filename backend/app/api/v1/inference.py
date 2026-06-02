"""Inference using the project's single active model."""

import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Deployment, InferenceLog, User
from app.services.inference.summary import build_detection_summary
from app.services.driver.detection import run_detection
from app.services.models.active_model import get_active_model

router = APIRouter(prefix="/inference", tags=["inference"])


@router.post("/project/{project_id}/predict")
async def predict(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    min_confidence: float | None = Form(None),
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

    start = time.perf_counter()
    predictions, error, meta = await run_detection(
        db, project_id, content, min_confidence=min_confidence,
    )
    latency_ms = (time.perf_counter() - start) * 1000

    if error:
        raise HTTPException(status_code=422, detail=error)

    primary = max(predictions, key=lambda p: p["confidence"]) if predictions else None
    summary = build_detection_summary(
        predictions,
        detected_vehicles=meta.get("detected_vehicles"),
        vehicle_count=meta.get("vehicle_count", 0),
    )

    dep_result = await db.execute(
        select(Deployment).where(Deployment.project_id == project_id, Deployment.name == "Live Model")
    )
    deployment = dep_result.scalar_one_or_none()

    if deployment:
        log = InferenceLog(
            deployment_id=deployment.id,
            input_hash=str(hash(content))[:16],
            predictions={"detections": predictions, "meta": meta},
            confidence=primary["confidence"] if primary else 0.0,
            latency_ms=latency_ms,
        )
        db.add(log)

    return {
        "model_id": str(artifact.id),
        "model_name": artifact.name,
        "architecture": artifact.architecture,
        "predictions": predictions,
        "primary_class": primary["class"] if primary else None,
        "primary_confidence": primary["confidence"] if primary else None,
        "confidence_threshold": meta.get("confidence_threshold"),
        "raw_detection_count": meta.get("raw_detection_count", 0),
        "vehicle_count": meta.get("vehicle_count", 0),
        "detected_vehicles": meta.get("detected_vehicles", []),
        "pipeline": meta.get("pipeline", "localized"),
        "detection_modes": meta.get("detection_modes", []),
        "summary": summary,
        "warnings": meta.get("warnings", []),
        "latency_ms": round(latency_ms, 1),
        "message": (
            f"Detected: {primary['class']}"
            if primary
            else (
                "Vehicle(s) found — no accident confirmed"
                if summary["vehicles"]["found"] and not summary["vehicles"]["accident"]["detected"]
                else "No objects detected"
            )
        ),
    }


@router.get("/project/{project_id}/status")
async def inference_status(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    artifact = await get_active_model(db, project_id)
    if not artifact:
        return {"ready": False, "endpoint": f"/api/v1/inference/project/{project_id}/predict"}
    metrics = artifact.metrics or {}
    classes = artifact.classes_used or []
    return {
        "ready": True,
        "model_id": str(artifact.id),
        "model_name": artifact.name,
        "classes": classes,
        "class_count": len(classes),
        "single_class_model": len(classes) <= 1,
        "is_mock": bool(metrics.get("mock")),
        "endpoint": f"/api/v1/inference/project/{project_id}/predict",
        "retrain_tip": (
            "Label tight boxes: damage on the car body, potholes on the road. "
            "Use Annotation to draw precise regions, then retrain."
            if len(classes) <= 1
            else "Use multiple classes with tight boxes per object (damage region, pothole, crack)."
        ),
    }
