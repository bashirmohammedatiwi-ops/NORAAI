"""Resolve deployable weights / ONNX for model artifacts."""

from __future__ import annotations

import uuid

from app.core.minio_client import download_bytes, object_exists, object_size
from app.models import ModelArtifact

ONNX_ONLY_PREFIX = "onnx-only:"
MIN_ONNX_BYTES = 10_000
MIN_WEIGHTS_BYTES = 100_000


def is_onnx_only_artifact(artifact: ModelArtifact | None) -> bool:
    if not artifact:
        return False
    metrics = artifact.metrics or {}
    if metrics.get("onnx_only"):
        return True
    key = artifact.minio_weights_key or ""
    return key.startswith(ONNX_ONLY_PREFIX)


def artifact_has_onnx(artifact: ModelArtifact | None) -> bool:
    if not artifact:
        return False
    if artifact.minio_onnx_key and object_exists(artifact.minio_onnx_key):
        size = object_size(artifact.minio_onnx_key)
        return bool(size and size >= MIN_ONNX_BYTES)
    return bool(first_available_onnx_key(artifact))


def artifact_has_pt_weights(artifact: ModelArtifact | None) -> bool:
    if not artifact or not artifact.minio_weights_key:
        return False
    if is_onnx_only_artifact(artifact):
        return False
    return bool(first_available_weights_key(artifact))


def _dedupe_keys(keys: list[str | None]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in keys:
        key = (raw or "").strip()
        if not key or key.startswith(ONNX_ONLY_PREFIX) or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _training_session_backup_keys(artifact: ModelArtifact) -> list[str]:
    metrics = artifact.metrics or {}
    keys: list[str] = []
    for session in metrics.get("training_sessions") or []:
        if isinstance(session, dict):
            keys.append(session.get("backup_key"))
    meta = metrics.get("training_sessions_meta") or {}
    for session in meta.get("sessions") or []:
        if isinstance(session, dict):
            keys.append(session.get("backup_key"))
    return keys


def weights_candidate_keys(artifact: ModelArtifact) -> list[str]:
    pid = artifact.project_id
    keys: list[str | None] = [artifact.minio_weights_key]
    if artifact.training_job_id:
        jid = artifact.training_job_id
        keys.append(f"projects/{pid}/models/{jid}/best.pt")
    keys.append(f"projects/{pid}/models/{artifact.id}/best.pt")
    keys.extend(_training_session_backup_keys(artifact))
    return _dedupe_keys(keys)


def onnx_candidate_keys(artifact: ModelArtifact) -> list[str]:
    pid = artifact.project_id
    aid = artifact.id
    keys: list[str | None] = [
        artifact.minio_onnx_key,
        f"projects/{pid}/mobile/{aid}/model.onnx",
        f"projects/{pid}/models/{aid}/model.onnx",
    ]
    if artifact.training_job_id:
        keys.append(f"projects/{pid}/models/{artifact.training_job_id}/model.onnx")
    weights_key = artifact.minio_weights_key or ""
    if weights_key.endswith(".pt"):
        keys.append(weights_key.replace(".pt", ".onnx"))
        keys.append(weights_key.replace("best.pt", "model.onnx"))
    for weights_key in weights_candidate_keys(artifact):
        if weights_key.endswith(".pt"):
            keys.append(weights_key.replace(".pt", ".onnx"))
            keys.append(weights_key.replace("best.pt", "model.onnx"))
    return _dedupe_keys(keys)


def first_available_onnx_key(artifact: ModelArtifact) -> str | None:
    for key in onnx_candidate_keys(artifact):
        size = object_size(key)
        if size and size >= MIN_ONNX_BYTES:
            return key
    return None


def first_available_weights_key(artifact: ModelArtifact) -> str | None:
    for key in weights_candidate_keys(artifact):
        size = object_size(key)
        if size and size >= MIN_WEIGHTS_BYTES:
            return key
    return None


def try_download_object(key: str, *, min_size: int = 1) -> bytes | None:
    try:
        size = object_size(key)
        if not size or size < min_size:
            return None
        data = download_bytes(key)
        if len(data) >= min_size:
            return data
    except Exception:
        return None
    return None


def resolve_onnx_bytes(artifact: ModelArtifact) -> tuple[bytes, str]:
    for key in onnx_candidate_keys(artifact):
        data = try_download_object(key, min_size=MIN_ONNX_BYTES)
        if data:
            return data, key
    raise ValueError(
        "ملف ONNX غير موجود في التخزين. "
        "أعد استيراد الموديل (.onnx) من صفحة الموديل الموحد أو أعد التدريب."
    )


def resolve_weights_bytes(artifact: ModelArtifact) -> tuple[bytes, str]:
    for key in weights_candidate_keys(artifact):
        data = try_download_object(key, min_size=MIN_WEIGHTS_BYTES)
        if data:
            return data, key
    raise ValueError(
        "ملف أوزان الموديل (.pt) غير موجود في التخزين. "
        "أعد استيراد الموديل من صفحة الموديل الموحد أو أعد التدريب."
    )


def repair_artifact_storage_keys(artifact: ModelArtifact) -> bool:
    """Point artifact MinIO keys at objects that actually exist."""
    changed = False

    onnx_key = first_available_onnx_key(artifact)
    if onnx_key and artifact.minio_onnx_key != onnx_key:
        artifact.minio_onnx_key = onnx_key
        changed = True

    if not is_onnx_only_artifact(artifact):
        weights_key = first_available_weights_key(artifact)
        if weights_key and artifact.minio_weights_key != weights_key:
            artifact.minio_weights_key = weights_key
            changed = True

    return changed


def artifact_storage_status(artifact: ModelArtifact) -> dict:
    onnx_key = first_available_onnx_key(artifact)
    weights_key = None if is_onnx_only_artifact(artifact) else first_available_weights_key(artifact)
    ready = bool(onnx_key or weights_key or is_onnx_only_artifact(artifact))
    return {
        "storage_ready": ready,
        "has_onnx": bool(onnx_key),
        "has_weights": bool(weights_key),
        "onnx_key": onnx_key,
        "weights_key": weights_key,
    }
