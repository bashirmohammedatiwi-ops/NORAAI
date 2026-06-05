"""Inference using the project's single active model."""

import hashlib
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Deployment, InferenceLog, User
from app.services.driver.detection import preload_project_model, run_detection
from app.services.driver.project_classes import get_project_classes
from app.services.inference.summary import build_detection_summary
from app.services.models.active_model import get_active_model

router = APIRouter(prefix="/inference", tags=["inference"])


@router.post("/project/{project_id}/predict")
async def predict(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    min_confidence: float | None = Form(None),
    simple: bool = Form(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    artifact = await get_active_model(db, project_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="لا يوجد نموذج مدرب")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="صورة فارغة")

    start = time.perf_counter()
    predictions, error, meta = await run_detection(
        db, project_id, content, min_confidence=min_confidence, simple=simple,
    )
    latency_ms = (time.perf_counter() - start) * 1000

    if error:
        raise HTTPException(status_code=422, detail=error)

    if simple:
        all_candidates = meta.get("all_candidates") or predictions
        return {
            "model_name": artifact.name,
            "classes": list(artifact.classes_used or []),
            "predictions": [
                {"class": p["class"], "confidence": p["confidence"], "bbox": p["bbox"]}
                for p in predictions
            ],
            "all_predictions": [
                {"class": p["class"], "confidence": p["confidence"], "bbox": p["bbox"]}
                for p in all_candidates
            ],
            "count": len(predictions),
            "raw_count": int(meta.get("raw_detection_count", 0)),
            "best_confidence": float(meta.get("best_confidence", 0)),
            "latency_ms": round(latency_ms, 1),
        }

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
            input_hash=hashlib.sha256(content).hexdigest()[:16],
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


@router.post("/project/{project_id}/warmup")
async def inference_warmup(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del user
    ok = await preload_project_model(db, project_id)
    return {"ready": ok}


@router.get("/project/{project_id}/status")
async def inference_status(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    artifact = await get_active_model(db, project_id)
    if not artifact:
        return {"ready": False}
    classes = list(artifact.classes_used or [])
    project_classes = await get_project_classes(db, project_id)
    color_by_name = {c.name: c.color or "#64748b" for c in project_classes}
    return {
        "ready": True,
        "model_name": artifact.name,
        "classes": [
            {"name": name, "color": color_by_name.get(name, "#64748b")}
            for name in classes
        ],
    }
