"""Inference using the project's single active model."""

import hashlib
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.minio_client import download_bytes
from app.models import Deployment, Image, InferenceLog, User
from app.services.driver.detection import preload_project_model, run_detection
from app.services.driver.project_classes import get_project_classes
from app.services.inference.manual_test_eval import (
    build_manual_test_warnings,
    compare_predictions,
    load_ground_truth,
)
from app.services.inference.resolve_settings import resolve_inference_imgsz, resolve_manual_test_confidence
from app.services.inference.summary import build_detection_summary
from app.services.models.active_model import get_active_model

router = APIRouter(prefix="/inference", tags=["inference"])


def _simple_predict_payload(
    artifact,
    predictions: list[dict],
    meta: dict,
    latency_ms: float,
    *,
    ground_truth: list[dict] | None = None,
    ground_truth_eval: dict | None = None,
    from_dataset: bool = False,
) -> dict:
    from app.core.config import get_settings

    settings = get_settings()
    all_candidates = meta.get("all_candidates") or predictions
    metrics = artifact.metrics or {}
    meta["training_map50"] = metrics.get("map50")
    meta["class_names_mismatch"] = bool(
        meta.get("model_class_names")
        and list(artifact.classes_used or []) != meta.get("model_class_names")
    )
    warnings = build_manual_test_warnings(
        meta,
        ground_truth_eval=ground_truth_eval,
        from_dataset=from_dataset,
    )
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
        "confidence_threshold": float(meta.get("confidence_threshold", 0.01)),
        "inference_imgsz": int(
            meta.get("inference_imgsz", resolve_inference_imgsz(artifact, settings, manual_test=True))
        ),
        "training_image_size": int(metrics.get("image_size", 640)),
        "recommended_confidence": resolve_manual_test_confidence(artifact, settings),
        "model_class_names": meta.get("model_class_names") or list(artifact.classes_used or []),
        "class_names_mismatch": bool(meta.get("class_names_mismatch")),
        "high_accuracy": bool(meta.get("high_accuracy")),
        "latency_ms": round(latency_ms, 1),
        "from_dataset": from_dataset,
        "ground_truth": ground_truth or [],
        "ground_truth_eval": ground_truth_eval,
        "warnings": warnings,
        "training_map50": metrics.get("map50"),
    }


@router.post("/project/{project_id}/predict")
async def predict(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    min_confidence: float | None = Form(None),
    simple: bool = Form(True),
    high_accuracy: bool = Form(True),
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
        db,
        project_id,
        content,
        min_confidence=min_confidence,
        simple=simple,
        high_accuracy=high_accuracy and simple,
    )
    latency_ms = (time.perf_counter() - start) * 1000

    if error:
        raise HTTPException(status_code=422, detail=error)

    if simple:
        return _simple_predict_payload(artifact, predictions, meta, latency_ms)

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


@router.post("/project/{project_id}/predict-image/{image_id}")
async def predict_dataset_image(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    min_confidence: float | None = Form(None),
    high_accuracy: bool = Form(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run inference on the exact stored dataset bytes (no upload re-encoding)."""
    del user
    artifact = await get_active_model(db, project_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="لا يوجد نموذج مدرب")

    image = await db.get(Image, image_id)
    if not image or image.project_id != project_id:
        raise HTTPException(status_code=404, detail="الصورة غير موجودة في المشروع")

    try:
        content = download_bytes(image.minio_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="ملف الصورة غير موجود") from exc
    if not content:
        raise HTTPException(status_code=400, detail="صورة فارغة")

    ground_truth, gt_errors = await load_ground_truth(db, project_id, image_id)
    if gt_errors:
        raise HTTPException(status_code=404, detail=gt_errors[0])

    start = time.perf_counter()
    predictions, error, meta = await run_detection(
        db,
        project_id,
        content,
        min_confidence=min_confidence,
        simple=True,
        high_accuracy=high_accuracy,
    )
    latency_ms = (time.perf_counter() - start) * 1000

    if error:
        raise HTTPException(status_code=422, detail=error)

    all_candidates = meta.get("all_candidates") or predictions
    gt_eval = compare_predictions(all_candidates, ground_truth)
    return _simple_predict_payload(
        artifact,
        predictions,
        meta,
        latency_ms,
        ground_truth=ground_truth,
        ground_truth_eval=gt_eval,
        from_dataset=True,
    )


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
    from app.core.config import get_settings

    settings = get_settings()
    artifact = await get_active_model(db, project_id)
    if not artifact:
        return {"ready": False}
    classes = list(artifact.classes_used or [])
    project_classes = await get_project_classes(db, project_id)
    color_by_name = {c.name: c.color or "#64748b" for c in project_classes}
    metrics = artifact.metrics or {}
    return {
        "ready": True,
        "model_name": artifact.name,
        "classes": [
            {"name": name, "color": color_by_name.get(name, "#64748b")}
            for name in classes
        ],
        "training_image_size": int(metrics.get("image_size", 640)),
        "inference_imgsz": resolve_inference_imgsz(artifact, settings, manual_test=True),
        "recommended_confidence": resolve_manual_test_confidence(artifact, settings),
        "map50_95": metrics.get("map50_95"),
        "class_manifest": metrics.get("class_manifest"),
    }
