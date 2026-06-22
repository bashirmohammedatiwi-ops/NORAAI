"""Import external YOLO weights (.pt) or ONNX into the platform registry."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import upload_bytes
from app.models import ModelArtifact, ModelLifecycle, Project
from app.services.driver.project_classes import ensure_project_classes
from app.services.models.active_model import ensure_live_deployment, promote_as_active_model
from app.services.models.artifact_weights import ONNX_ONLY_PREFIX


def _validate_weights_bytes(data: bytes) -> None:
    if not data or len(data) < 1024:
        raise ValueError("ملف الموديل فارغ أو صغير جداً")
    if data == b"mock_weights":
        raise ValueError("ملف mock غير صالح")
    # PyTorch zip magic or legacy pickle header
    if data[:2] != b"PK" and not data[:2].startswith(b"\x80"):
        raise ValueError("الملف لا يبدو ملف PyTorch (.pt) صالح")


def _validate_onnx_bytes(data: bytes) -> None:
    if not data or len(data) < 10_000:
        raise ValueError("ملف ONNX فارغ أو صغير جداً")


async def import_model_artifact(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    weights_bytes: bytes | None = None,
    name: str,
    architecture: str = "yolo11",
    model_variant: str = "n",
    classes: list[str],
    promote: bool = True,
    onnx_bytes: bytes | None = None,
    source: str = "import",
    resize_mode: str = "letterbox",
) -> ModelArtifact:
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("Project not found")

    if not weights_bytes and not onnx_bytes:
        raise ValueError("ارفع ملف .pt أو .onnx على الأقل")

    if weights_bytes:
        _validate_weights_bytes(weights_bytes)
    if onnx_bytes:
        _validate_onnx_bytes(onnx_bytes)

    artifact_id = uuid.uuid4()
    minio_key: str
    if weights_bytes:
        minio_key = f"projects/{project_id}/models/imported/{artifact_id}.pt"
        upload_bytes(minio_key, weights_bytes, "application/octet-stream")
    else:
        minio_key = f"{ONNX_ONLY_PREFIX}{artifact_id}"

    onnx_key: str | None = None
    if onnx_bytes:
        onnx_key = f"projects/{project_id}/models/imported/{artifact_id}.onnx"
        upload_bytes(onnx_key, onnx_bytes, "application/octet-stream")

    clean_classes = [c.strip() for c in classes if c and str(c).strip()]
    payload_bytes = weights_bytes or onnx_bytes or b""
    size_mb = len(payload_bytes) / (1024 * 1024)

    artifact = ModelArtifact(
        id=artifact_id,
        project_id=project_id,
        training_job_id=None,
        name=name.strip() or "Imported Model",
        architecture=architecture,
        lifecycle=ModelLifecycle.REGISTERED,
        minio_weights_key=minio_key,
        minio_onnx_key=onnx_key,
        classes_used=clean_classes,
        metrics={
            "imported": True,
            "imported_at": datetime.now(timezone.utc).isoformat(),
            "model_variant": model_variant,
            "metrics_source": "import",
            "source": source,
            "onnx_only": weights_bytes is None and onnx_bytes is not None,
            "resize_mode": resize_mode,
            "image_size": 640,
        },
        gpu_used="import",
        model_size_mb=size_mb,
    )
    db.add(artifact)
    await db.flush()

    await ensure_project_classes(db, project_id, clean_classes)

    if promote:
        await promote_as_active_model(db, project_id, artifact_id)
        await ensure_live_deployment(db, project_id, artifact_id)
        artifact.lifecycle = ModelLifecycle.PRODUCTION
        if onnx_bytes:
            from app.services.mobile.driver_deploy import sync_driver_model

            try:
                await sync_driver_model(db, project, artifact_id, promote_active=False)
            except Exception:
                pass  # mobile sync can be retried from dashboard

    await db.commit()
    await db.refresh(artifact)
    return artifact
