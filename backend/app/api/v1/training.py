from datetime import datetime, timezone

from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, verify_user_password
from app.core.config import get_settings
from app.core.database import get_db
from app.models import ClassLabel, HyperparameterTrial, ModelArchitecture, ModelArtifact, TrainingJob, TrainingMetric, TrainingMode, TrainingStatus, User
from app.services.datasets.dataset_images import ensure_default_dataset, get_dataset_summary
from app.services.models.active_model import get_active_model_status
from app.services.models.deletion import delete_all_project_models, delete_model_artifact
from app.schemas import (
    DeleteResultResponse,
    ModelArtifactResponse,
    ModelCompareRequest,
    PasswordConfirmRequest,
    RetrainConfigOverrides,
    TrainingJobCreate,
    TrainingJobResponse,
)
from app.services.evaluation.compare import compare_models
from app.services.training.cpu_presets import DEFAULT_CPU_PRESET, build_retrain_config
from app.services.training.cancellation import request_training_cancel
from app.services.training.service import TRAINING_OPTIONS, get_job_detail, job_to_summary
from workers.celery_app import celery_app
from workers.training.tasks import cancel_training_job, run_training_job

router = APIRouter(tags=["training", "models"])


def _normalize_training_architecture(architecture: str, config: dict) -> tuple[str, dict]:
    """Map yolo11n/yolo11s UI values to stored architecture + model_variant."""
    arch = (architecture or "yolo11").strip().lower()
    variant = config.get("model_variant")
    if arch == "yolo11n":
        arch, variant = "yolo11", "n"
    elif arch == "yolo11s":
        arch, variant = "yolo11", "s"
    if variant in ("n", "s"):
        config = dict(config)
        config["model_variant"] = variant
    if arch not {a.value for a in ModelArchitecture}:
        arch = "yolo11"
    return arch, config


async def _normalize_training_class_ids(
    db: AsyncSession,
    project_id: UUID,
    class_ids: list[UUID] | None,
) -> list[str] | None:
    if class_ids is None:
        return None
    if not class_ids:
        raise HTTPException(status_code=400, detail="اختر فئة واحدة على الأقل للتدريب")

    result = await db.execute(
        select(ClassLabel.id).where(
            ClassLabel.project_id == project_id,
            ClassLabel.is_archived == False,
            ClassLabel.id.in_(class_ids),
        )
    )
    found = {str(row[0]) for row in result.all()}
    ordered: list[str] = []
    seen: set[str] = set()
    for cid in class_ids:
        key = str(cid)
        if key not in found or key in seen:
            continue
        seen.add(key)
        ordered.append(key)

    if len(ordered) != len({str(cid) for cid in class_ids}):
        raise HTTPException(status_code=400, detail="بعض الفئات المختارة غير موجودة أو مؤرشفة")
    return ordered


def _apply_retrain_overrides(config: dict, overrides: RetrainConfigOverrides | None) -> dict:
    if not overrides:
        return config
    data = overrides.model_dump(exclude_none=True)
    if not data:
        return config
    if "image_size" in data:
        config["_image_size_locked"] = True
    config.update(data)
    from app.services.training.cpu_tuning import tune_training_config
    from app.services.training.fine_tune import apply_fine_tune_training_overrides

    return tune_training_config(apply_fine_tune_training_overrides(config))


@router.get("/training/options")
async def get_training_options():
    return TRAINING_OPTIONS


@router.get("/training/project/{project_id}", response_model=list[TrainingJobResponse])
async def list_training_jobs(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingJob).where(TrainingJob.project_id == project_id).order_by(TrainingJob.created_at.desc())
    )
    jobs = result.scalars().all()
    summaries = []
    for j in jobs:
        summary = await job_to_summary(db, j)
        summaries.append(TrainingJobResponse(**summary))
    return summaries


@router.get("/training/{job_id}")
async def get_training_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    detail = await get_job_detail(db, job_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Training job not found")
    return detail


@router.post("/training/project/{project_id}", response_model=TrainingJobResponse)
async def create_training_job(
    project_id: UUID,
    data: TrainingJobCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.training.guard import ensure_no_running_training_async

    await ensure_no_running_training_async(db, project_id)

    config = dict(data.config or {})
    raw_class_ids = config.pop("class_ids", None)
    if raw_class_ids is not None:
        parsed = [UUID(str(cid)) for cid in raw_class_ids]
        config["class_ids"] = await _normalize_training_class_ids(db, project_id, parsed)

    if config.get("training_from_scratch"):
        config["fine_tune_from_active"] = False
        config["continuous"] = False
        config.pop("source_model_artifact_id", None)

    source_model_id = config.get("source_model_artifact_id")
    if source_model_id:
        try:
            artifact_uuid = UUID(str(source_model_id))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid source model ID") from exc
        artifact = await db.get(ModelArtifact, artifact_uuid)
        if not artifact or artifact.project_id != project_id:
            raise HTTPException(status_code=400, detail="Selected model not found in this project")
        from app.services.models.registry import assign_model_numbers

        result = await db.execute(select(ModelArtifact).where(ModelArtifact.project_id == project_id))
        numbers = assign_model_numbers(list(result.scalars().all()))
        config["source_model_artifact_id"] = str(artifact_uuid)
        config["_source_model_number"] = numbers.get(artifact_uuid)
        config["fine_tune_from_active"] = True
        config["continuous"] = True
        config.pop("training_from_scratch", None)
    elif config.get("fine_tune_from_active"):
        from app.services.driver.project_classes import is_production_model
        from app.services.models.active_model import get_active_model

        active = await get_active_model(db, project_id)
        if active and is_production_model(active):
            from app.services.models.registry import assign_model_numbers

            result = await db.execute(select(ModelArtifact).where(ModelArtifact.project_id == project_id))
            numbers = assign_model_numbers(list(result.scalars().all()))
            config["source_model_artifact_id"] = str(active.id)
            config["_source_model_number"] = numbers.get(active.id)
        elif not config.get("training_from_scratch"):
            raise HTTPException(
                status_code=400,
                detail="لا يوجد موديل مدرب للمتابعة. اختر «من الصفر» أو درّب موديلاً أولاً.",
            )

    arch_value, config = _normalize_training_architecture(data.architecture, config)

    job = TrainingJob(
        project_id=project_id,
        name=data.name,
        architecture=ModelArchitecture(arch_value),
        training_mode=TrainingMode(data.training_mode),
        model_definition_id=data.model_definition_id,
        dataset_version_id=data.dataset_version_id,
        hpo_enabled=data.hpo_enabled,
        config=config,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    try:
        task = run_training_job.delay(str(job.id))
    except Exception as exc:
        job.status = TrainingStatus.FAILED
        job.error_message = f"Training worker unavailable: {exc}"
        await db.flush()
        raise HTTPException(
            status_code=503,
            detail="Training worker is not available. Check worker-training container and Redis.",
        ) from exc
    job.celery_task_id = task.id
    await db.flush()

    return TrainingJobResponse(
        id=job.id,
        name=job.name,
        architecture=job.architecture.value,
        status=job.status.value,
        hpo_enabled=job.hpo_enabled,
        created_at=job.created_at,
    )


@router.post("/training/{job_id}/cancel")
async def cancel_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(TrainingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in (TrainingStatus.PENDING, TrainingStatus.RUNNING):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in status {job.status.value}")

    request_training_cancel(str(job_id))
    if job.celery_task_id:
        celery_app.control.revoke(job.celery_task_id, terminate=True, signal="SIGTERM")

    job.status = TrainingStatus.CANCELLED
    job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    cancel_training_job.delay(str(job_id))
    return {"status": "cancelled", "job_id": str(job_id)}


@router.get("/training/{job_id}/metrics")
async def get_training_metrics(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TrainingMetric).where(TrainingMetric.training_job_id == job_id).order_by(TrainingMetric.epoch)
    )
    return [
        {
            "epoch": m.epoch,
            "loss": m.loss,
            "precision": m.precision,
            "recall": m.recall,
            "f1": m.f1,
            "map50": m.map50,
            "map50_95": m.map50_95,
        }
        for m in result.scalars().all()
    ]


@router.get("/training/{job_id}/trials")
async def get_hpo_trials(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HyperparameterTrial)
        .where(HyperparameterTrial.training_job_id == job_id)
        .order_by(HyperparameterTrial.trial_number)
    )
    return [
        {
            "id": str(t.id),
            "trial_number": t.trial_number,
            "params": t.params,
            "metrics": t.metrics,
            "status": t.status,
            "is_best": t.is_best,
        }
        for t in result.scalars().all()
    ]


@router.get("/models/project/{project_id}", response_model=list[ModelArtifactResponse])
async def list_models(project_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.services.models.registry import list_project_model_artifacts

    return await list_project_model_artifacts(db, project_id)


@router.get("/models/{model_id}", response_model=ModelArtifactResponse)
async def get_model(model_id: UUID, db: AsyncSession = Depends(get_db)):
    from app.models import Project
    from app.services.models.registry import assign_model_numbers

    model = await db.get(ModelArtifact, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    result = await db.execute(
        select(ModelArtifact).where(ModelArtifact.project_id == model.project_id)
    )
    numbers = assign_model_numbers(list(result.scalars().all()))
    project = await db.get(Project, model.project_id)
    return ModelArtifactResponse.from_artifact(
        model,
        model_number=numbers.get(model.id, 0),
        is_active=project.active_model_artifact_id == model.id if project else False,
    )


@router.get("/training/project/{project_id}/environment")
async def training_environment(project_id: UUID):
    from app.services.training.hardware import detect_hardware, resolve_training_device_value

    settings = get_settings()
    hw = detect_hardware()
    device = resolve_training_device_value({}, settings)
    return {
        "project_id": str(project_id),
        "device": hw["best_device"],
        "cpu_fallback": settings.training_cpu_fallback,
        "mock_on_failure": settings.training_mock_on_failure,
        "label": hw["best_device_label"],
        "hardware": hw,
    }


@router.delete("/models/{model_id}", response_model=DeleteResultResponse)
async def remove_model(
    model_id: UUID,
    data: PasswordConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await delete_model_artifact(db, model_id, user.organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeleteResultResponse(deleted=result["deleted"], message=f"Model '{result['model_name']}' deleted.")


@router.delete("/projects/{project_id}/models", response_model=DeleteResultResponse)
async def remove_all_project_models(
    project_id: UUID,
    data: PasswordConfirmRequest,
    delete_jobs: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_user_password(user, data.password)
    try:
        result = await delete_all_project_models(
            db, project_id, user.organization_id, delete_jobs=delete_jobs
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    msg = f"Removed {result['models_removed']} model(s) from project."
    if result.get("jobs_removed"):
        msg += f" Deleted {result['jobs_removed']} training job(s)."
    return DeleteResultResponse(deleted=result["deleted"], message=msg)


@router.patch("/models/{model_id}/lifecycle")
async def update_model_lifecycle(model_id: UUID, lifecycle: str, db: AsyncSession = Depends(get_db)):
    from app.models import ModelLifecycle
    from app.services.models.active_model import ensure_live_deployment, promote_as_active_model

    model = await db.get(ModelArtifact, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    new_lifecycle = ModelLifecycle(lifecycle)
    if new_lifecycle == ModelLifecycle.PRODUCTION:
        model = await promote_as_active_model(db, model.project_id, model_id)
        await ensure_live_deployment(db, model.project_id, model_id)
    else:
        model.lifecycle = new_lifecycle

    return {"id": str(model.id), "lifecycle": model.lifecycle.value}


@router.post("/models/compare")
async def compare_model_artifacts(data: ModelCompareRequest, db: AsyncSession = Depends(get_db)):
    return await compare_models(db, data.model_ids)


@router.post("/models/project/{project_id}/import", response_model=ModelArtifactResponse)
async def import_project_model(
    project_id: UUID,
    weights_file: UploadFile = File(..., description="YOLO .pt weights"),
    name: str = Form("Imported Model"),
    architecture: str = Form("yolo11"),
    model_variant: str = Form("n"),
    classes: str = Form("", description="Comma-separated class names"),
    promote: bool = Form(True),
    onnx_file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import external trained weights (e.g. from Local Trainer) into the project."""
    from app.models import Project
    from app.services.models.import_model import import_model_artifact
    from app.services.models.registry import assign_model_numbers

    if not weights_file.filename or not weights_file.filename.lower().endswith(".pt"):
        raise HTTPException(status_code=400, detail="Upload a .pt weights file")

    weights_bytes = await weights_file.read()
    onnx_bytes: bytes | None = None
    if onnx_file and onnx_file.filename:
        onnx_bytes = await onnx_file.read()

    class_list = [c.strip() for c in classes.split(",") if c.strip()]
    arch_value, _ = _normalize_training_architecture(architecture, {"model_variant": model_variant})

    try:
        artifact = await import_model_artifact(
            db,
            project_id,
            weights_bytes=weights_bytes,
            name=name,
            architecture=arch_value,
            model_variant=model_variant if model_variant in ("n", "s") else "n",
            classes=class_list,
            promote=promote,
            onnx_bytes=onnx_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = await db.execute(
        select(ModelArtifact).where(ModelArtifact.project_id == project_id)
    )
    numbers = assign_model_numbers(list(result.scalars().all()))
    project = await db.get(Project, project_id)
    return ModelArtifactResponse.from_artifact(
        artifact,
        model_number=numbers.get(artifact.id, 0),
        is_active=project.active_model_artifact_id == artifact.id if project else False,
    )


@router.get("/projects/{project_id}/active-model")
async def project_active_model(project_id: UUID, db: AsyncSession = Depends(get_db)):
    status = await get_active_model_status(db, project_id)
    if not status:
        raise HTTPException(status_code=404, detail="Project not found")
    return status


@router.post("/training/project/{project_id}/retrain", response_model=TrainingJobResponse)
async def retrain_project_model(
    project_id: UUID,
    epochs: int | None = Query(None, ge=5, le=200),
    architecture: str = Query("yolo11"),
    preset: str = Query(
        "turbo_accuracy",
        pattern="^(turbo_accuracy|hostinger_production|ultimate_accuracy|fine_tune|best_accuracy|max_cpu|fleet_cpu|turbo_cpu|fast_cpu|balanced)$",
    ),
    fine_tune: bool = Query(True, description="Continue training from active Main Model weights"),
    source_model_artifact_id: UUID | None = Query(
        None, description="Specific trained model to continue from (#1, #2, …)"
    ),
    class_ids: list[UUID] | None = Query(None, description="Train only on these class IDs"),
    overrides: RetrainConfigOverrides | None = Body(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrain on the latest dataset — optionally continue from a numbered trained model."""
    from app.services.training.guard import ensure_no_running_training_async

    await ensure_no_running_training_async(db, project_id)

    dataset = await ensure_default_dataset(db, project_id)
    summary = await get_dataset_summary(db, dataset.id)
    if not summary or summary.get("image_count", 0) < 1:
        raise HTTPException(status_code=400, detail="No images in dataset. Upload via Dataset Builder first.")

    head_version_id = summary.get("head_version_id")
    if not head_version_id:
        raise HTTPException(status_code=400, detail="Dataset has no version")

    config = build_retrain_config(epochs, preset, fine_tune_from_active=fine_tune)

    from app.services.driver.project_classes import is_production_model
    from app.services.models.active_model import get_active_model

    if fine_tune and not source_model_artifact_id:
        active = await get_active_model(db, project_id)
        if active and is_production_model(active):
            source_model_artifact_id = active.id
        else:
            raise HTTPException(
                status_code=400,
                detail="لا يوجد موديل مدرب للمتابعة. درّب موديلاً أولاً أو عطّل fine_tune للبدء من الصفر.",
            )

    if source_model_artifact_id:
        artifact = await db.get(ModelArtifact, source_model_artifact_id)
        if not artifact or artifact.project_id != project_id:
            raise HTTPException(status_code=400, detail="Selected model not found in this project")
        if not is_production_model(artifact):
            raise HTTPException(
                status_code=400,
                detail="الموديل المختار لا يحتوي أوزاناً حقيقية (تدريب محاكى). أعد التدريب من الصفر.",
            )
        from app.services.models.registry import assign_model_numbers

        result = await db.execute(select(ModelArtifact).where(ModelArtifact.project_id == project_id))
        numbers = assign_model_numbers(list(result.scalars().all()))
        config["source_model_artifact_id"] = str(source_model_artifact_id)
        config["_source_model_number"] = numbers.get(source_model_artifact_id)
        config["fine_tune_from_active"] = True
        config["continuous"] = True
        config.pop("training_from_scratch", None)
    normalized_class_ids = await _normalize_training_class_ids(db, project_id, class_ids)
    if normalized_class_ids:
        config["class_ids"] = normalized_class_ids

    config = _apply_retrain_overrides(config, overrides)
    arch_value, config = _normalize_training_architecture(architecture, config)

    job = TrainingJob(
        project_id=project_id,
        name="Retrain Main Model",
        architecture=ModelArchitecture(arch_value),
        training_mode=TrainingMode.SINGLE_GPU,
        dataset_version_id=UUID(head_version_id) if isinstance(head_version_id, str) else head_version_id,
        hpo_enabled=False,
        config=config,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    try:
        task = run_training_job.delay(str(job.id))
    except Exception as exc:
        job.status = TrainingStatus.FAILED
        job.error_message = f"Training worker unavailable: {exc}"
        await db.flush()
        raise HTTPException(
            status_code=503,
            detail="Training worker is not available. Check worker-training container and Redis.",
        ) from exc
    job.celery_task_id = task.id
    await db.flush()

    return TrainingJobResponse(
        id=job.id,
        name=job.name,
        architecture=job.architecture.value,
        status=job.status.value,
        hpo_enabled=job.hpo_enabled,
        created_at=job.created_at,
    )
