"""Import external YOLO weights (.pt) into the platform registry."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import upload_bytes
from app.models import ModelArtifact, ModelLifecycle, Project
from app.services.models.active_model import ensure_live_deployment, promote_as_active_model


def _validate_weights_bytes(data: bytes) -> None:
    if not data or len(data) < 1024:
        raise ValueError("ملف الموديل فارغ أو صغير جداً")
    if data == b"mock_weights":
        raise ValueError("ملف mock غير صالح")
    # PyTorch zip magic or legacy pickle header
    if data[:2] != b"PK" and not data[:2].startswith(b"\x80"):
        raise ValueError("الملف لا يبدو ملف PyTorch (.pt) صالح")


async def import_model_artifact(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    weights_bytes: bytes,
    name: str,
    architecture: str = "yolo11",
    model_variant: str = "n",
    classes: list[str],
    promote: bool = True,
    onnx_bytes: bytes | None = None,
) -> ModelArtifact:
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("Project not found")

    _validate_weights_bytes(weights_bytes)

    artifact_id = uuid.uuid4()
    minio_key = f"projects/{project_id}/models/imported/{artifact_id}.pt"
    upload_bytes(minio_key, weights_bytes, "application/octet-stream")

    onnx_key: str | None = None
    if onnx_bytes:
        onnx_key = f"projects/{project_id}/models/imported/{artifact_id}.onnx"
        upload_bytes(onnx_key, onnx_bytes, "application/octet-stream")

    clean_classes = [c.strip() for c in classes if c and str(c).strip()]
    size_mb = len(weights_bytes) / (1024 * 1024)

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
        },
        gpu_used="import",
        model_size_mb=size_mb,
    )
    db.add(artifact)
    await db.flush()

    if promote:
        await promote_as_active_model(db, project_id, artifact_id)
        await ensure_live_deployment(db, project_id, artifact_id)
        artifact.lifecycle = ModelLifecycle.PRODUCTION

    await db.commit()
    await db.refresh(artifact)
    return artifact
