"""Export and deploy models to mobile driver devices."""

from __future__ import annotations

import asyncio
import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.minio_client import download_bytes, object_size, open_object, upload_bytes
from app.models import ModelArtifact, Project
from app.services.driver.project_classes import is_production_model, model_class_names
from app.services.models.artifact_weights import (
    MIN_ONNX_BYTES,
    is_onnx_only_artifact,
    repair_artifact_storage_keys,
    resolve_onnx_bytes,
    resolve_weights_bytes,
)
from app.services.mobile.config import get_mobile_config, patch_mobile_config
from app.services.models.active_model import promote_as_active_model


def mobile_onnx_key(project_id: uuid.UUID, artifact_id: uuid.UUID) -> str:
    return f"projects/{project_id}/mobile/{artifact_id}/model.onnx"


def mobile_manifest_key(project_id: uuid.UUID, artifact_id: uuid.UUID) -> str:
    return f"projects/{project_id}/mobile/{artifact_id}/manifest.json"


async def resolve_driver_artifact(db: AsyncSession, project: Project) -> ModelArtifact | None:
    """Mobile-deployed model first, then auto-resolved active model."""
    from app.services.models.active_model import get_active_model

    if project.driver_model_artifact_id:
        artifact = await db.get(ModelArtifact, project.driver_model_artifact_id)
        if (
            artifact
            and artifact.project_id == project.id
            and is_production_model(artifact)
        ):
            return artifact

    return await get_active_model(db, project.id)


def resolve_driver_artifact_sync(session: Session, project: Project) -> ModelArtifact | None:
    from app.services.models.active_model import get_active_model_sync

    if project.driver_model_artifact_id:
        artifact = session.get(ModelArtifact, project.driver_model_artifact_id)
        if (
            artifact
            and artifact.project_id == project.id
            and is_production_model(artifact)
        ):
            return artifact

    return get_active_model_sync(session, project.id)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_onnx_bytes(data: bytes) -> None:
    if not data or len(data) < MIN_ONNX_BYTES:
        raise ValueError("ملف ONNX فارغ أو صغير جداً — فشل التصدير من أوزان .pt")


def _export_onnx_from_weights(
    weights_bytes: bytes,
    architecture: str,
    output_path: str,
    *,
    model_variant: str | None = None,
) -> None:
    from ml.training.adapters import get_adapter

    with tempfile.TemporaryDirectory() as tmp:
        weights_path = str(Path(tmp) / "weights.pt")
        Path(weights_path).write_bytes(weights_bytes)
        adapter = get_adapter(architecture or "yolo11", model_variant)
        adapter.export_onnx(weights_path, output_path)
        _validate_onnx_bytes(Path(output_path).read_bytes())


def load_stored_mobile_manifest(artifact: ModelArtifact) -> dict | None:
    """Read pre-synced manifest from MinIO (fast — no ONNX export)."""
    try:
        raw = download_bytes(mobile_manifest_key(artifact.project_id, artifact.id))
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def ensure_mobile_onnx_meta(artifact: ModelArtifact) -> tuple[str, str, int]:
    """Return MinIO key, sha256, byte size — export only when cache is missing."""
    onnx_key = mobile_onnx_key(artifact.project_id, artifact.id)
    stored = load_stored_mobile_manifest(artifact)
    size = object_size(onnx_key)

    if size and size > 10_000 and stored and stored.get("sha256"):
        return onnx_key, str(stored["sha256"]).lower(), size

    if size and size > 10_000:
        data = download_bytes(onnx_key)
        sha = _sha256_bytes(data)
        manifest = build_model_manifest(artifact, sha, onnx_byte_len=len(data))
        upload_bytes(
            mobile_manifest_key(artifact.project_id, artifact.id),
            json.dumps(manifest).encode("utf-8"),
            "application/json",
        )
        return onnx_key, sha, len(data)

    data, sha = ensure_mobile_onnx_bytes(artifact)
    manifest = build_model_manifest(artifact, sha, onnx_byte_len=len(data))
    upload_bytes(
        mobile_manifest_key(artifact.project_id, artifact.id),
        json.dumps(manifest).encode("utf-8"),
        "application/json",
    )
    return onnx_key, sha, len(data)


def iter_mobile_onnx_chunks(
    artifact: ModelArtifact,
    *,
    offset: int = 0,
    chunk_size: int = 256 * 1024,
):
    """Stream ONNX bytes from MinIO in chunks."""
    onnx_key, _, _ = ensure_mobile_onnx_meta(artifact)
    response = open_object(onnx_key, offset=offset)
    try:
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        response.close()
        response.release_conn()


def ensure_mobile_onnx_bytes(artifact: ModelArtifact) -> tuple[bytes, str]:
    """Return ONNX bytes and sha256, exporting from .pt weights when needed."""
    onnx_key = mobile_onnx_key(artifact.project_id, artifact.id)
    try:
        data = download_bytes(onnx_key)
        if data and len(data) > 10_000:
            return data, _sha256_bytes(data)
    except Exception:
        pass

    try:
        data, source_key = resolve_onnx_bytes(artifact)
        if source_key != onnx_key:
            upload_bytes(onnx_key, data, "application/octet-stream")
        return data, _sha256_bytes(data)
    except ValueError:
        pass

    if is_onnx_only_artifact(artifact):
        raise ValueError(
            "ملف ONNX غير موجود في التخزين. "
            "أعد استيراد الموديل (.onnx) من صفحة الموديل الموحد."
        )

    weights_bytes, _ = resolve_weights_bytes(artifact)

    metrics = artifact.metrics or {}
    model_variant = str(metrics.get("model_variant") or "").strip() or None

    with tempfile.TemporaryDirectory() as tmp:
        out_path = str(Path(tmp) / "model.onnx")
        _export_onnx_from_weights(
            weights_bytes,
            artifact.architecture or "yolo11",
            out_path,
            model_variant=model_variant,
        )
        data = Path(out_path).read_bytes()

    _validate_onnx_bytes(data)
    upload_bytes(onnx_key, data, "application/octet-stream")
    return data, _sha256_bytes(data)


def build_model_manifest(
    artifact: ModelArtifact,
    sha256: str,
    onnx_byte_len: int | None = None,
) -> dict:
    metrics = artifact.metrics or {}
    image_size = int(metrics.get("image_size") or 640)
    resize_mode = str(metrics.get("resize_mode") or "letterbox")
    classes = model_class_names(artifact)
    version = sha256[:16]
    if onnx_byte_len is not None and onnx_byte_len > 0:
        size_mb = round(onnx_byte_len / (1024 * 1024), 2)
    else:
        size_mb = round((artifact.model_size_mb or 0), 2)
    return {
        "artifact_id": str(artifact.id),
        "model_name": artifact.name,
        "architecture": artifact.architecture,
        "version": version,
        "sha256": sha256,
        "format": "onnx",
        "image_size": image_size,
        "resize_mode": resize_mode,
        "nc": len(classes),
        "classes": classes,
        "model_size_mb": size_mb,
        "model_bytes": onnx_byte_len if onnx_byte_len and onnx_byte_len > 0 else None,
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

    if await asyncio.to_thread(repair_artifact_storage_keys, artifact):
        await db.flush()

    onnx_bytes, sha256 = await asyncio.to_thread(ensure_mobile_onnx_bytes, artifact)
    _validate_onnx_bytes(onnx_bytes)
    manifest = build_model_manifest(artifact, sha256, onnx_byte_len=len(onnx_bytes))
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
