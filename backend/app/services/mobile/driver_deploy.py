"""Export and deploy models to mobile driver devices."""

from __future__ import annotations

import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes, upload_bytes
from app.models import ModelArtifact, Project
from app.services.driver.project_classes import is_production_model, model_class_names
from app.services.mobile.config import get_mobile_config, patch_mobile_config
from app.services.models.active_model import promote_as_active_model


def mobile_onnx_key(project_id: uuid.UUID, artifact_id: uuid.UUID) -> str:
    return f"projects/{project_id}/mobile/{artifact_id}/model.onnx"


def mobile_manifest_key(project_id: uuid.UUID, artifact_id: uuid.UUID) -> str:
    return f"projects/{project_id}/mobile/{artifact_id}/manifest.json"


async def resolve_driver_artifact(db: AsyncSession, project: Project) -> ModelArtifact | None:
    artifact_id = project.driver_model_artifact_id or project.active_model_artifact_id
    if not artifact_id:
        return None
    artifact = await db.get(ModelArtifact, artifact_id)
    if not artifact or artifact.project_id != project.id:
        return None
    if not is_production_model(artifact):
        return None
    return artifact


def resolve_driver_artifact_sync(session: Session, project: Project) -> ModelArtifact | None:
    artifact_id = project.driver_model_artifact_id or project.active_model_artifact_id
    if not artifact_id:
        return None
    artifact = session.get(ModelArtifact, artifact_id)
    if not artifact or artifact.project_id != project.id:
        return None
    if not is_production_model(artifact):
        return None
    return artifact


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _export_onnx_from_weights(weights_bytes: bytes, architecture: str, output_path: str) -> None:
    from ml.training.adapters import get_adapter

    with tempfile.TemporaryDirectory() as tmp:
        weights_path = str(Path(tmp) / "weights.pt")
        Path(weights_path).write_bytes(weights_bytes)
        adapter = get_adapter(architecture or "yolo11")
        adapter.export_onnx(weights_path, output_path)


def ensure_mobile_onnx_bytes(artifact: ModelArtifact) -> tuple[bytes, str]:
    """Return ONNX bytes and sha256, exporting from .pt weights when needed."""
    onnx_key = mobile_onnx_key(artifact.project_id, artifact.id)
    try:
        data = download_bytes(onnx_key)
        if data and len(data) > 10_000:
            return data, _sha256_bytes(data)
    except Exception:
        pass

    if artifact.minio_onnx_key:
        try:
            data = download_bytes(artifact.minio_onnx_key)
            if data and len(data) > 10_000:
                upload_bytes(onnx_key, data, "application/octet-stream")
                return data, _sha256_bytes(data)
        except Exception:
            pass

    weights_bytes = download_bytes(artifact.minio_weights_key)
    if not weights_bytes or len(weights_bytes) < 100_000:
        raise ValueError("Model weights are missing or invalid")

    with tempfile.TemporaryDirectory() as tmp:
        out_path = str(Path(tmp) / "model.onnx")
        _export_onnx_from_weights(weights_bytes, artifact.architecture or "yolo11", out_path)
        data = Path(out_path).read_bytes()

    upload_bytes(onnx_key, data, "application/octet-stream")
    return data, _sha256_bytes(data)


def build_model_manifest(artifact: ModelArtifact, sha256: str) -> dict:
    metrics = artifact.metrics or {}
    image_size = int(metrics.get("image_size") or 640)
    classes = model_class_names(artifact)
    version = sha256[:16]
    return {
        "artifact_id": str(artifact.id),
        "model_name": artifact.name,
        "architecture": artifact.architecture,
        "version": version,
        "sha256": sha256,
        "format": "onnx",
        "image_size": image_size,
        "nc": len(classes),
        "classes": classes,
        "model_size_mb": round((artifact.model_size_mb or 0), 2),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def sync_driver_model(
    db: AsyncSession,
    project: Project,
    artifact_id: uuid.UUID,
    *,
    promote_active: bool = False,
) -> dict:
    artifact = await db.get(ModelArtifact, artifact_id)
    if not artifact or artifact.project_id != project.id:
        raise ValueError("Model not found in this project")
    if not is_production_model(artifact):
        raise ValueError("Selected model has no valid trained weights")

    onnx_bytes, sha256 = ensure_mobile_onnx_bytes(artifact)
    manifest = build_model_manifest(artifact, sha256)
    upload_bytes(
        mobile_manifest_key(project.id, artifact.id),
        json.dumps(manifest).encode("utf-8"),
        "application/json",
    )

    project.driver_model_artifact_id = artifact.id
    if promote_active:
        await promote_as_active_model(db, project.id, artifact.id)

    mobile_cfg = get_mobile_config(project)
    mobile_cfg["deployment"] = {
        "artifact_id": str(artifact.id),
        "model_version": manifest["version"],
        "sha256": sha256,
        "synced_at": manifest["updated_at"],
        "onnx_size_mb": round(len(onnx_bytes) / (1024 * 1024), 2),
    }
    patch_mobile_config(project, mobile_cfg)
    await db.flush()

    try:
        from app.core.redis_client import get_redis

        redis = await get_redis()
        await redis.publish(
            f"mobile:{project.id}",
            json.dumps({"type": "model_synced", "manifest": manifest}),
        )
    except Exception:
        pass

    try:
        from app.services.inference.model_cache import invalidate_weights

        if artifact.minio_weights_key:
            invalidate_weights(artifact.minio_weights_key)
    except Exception:
        pass

    return manifest
