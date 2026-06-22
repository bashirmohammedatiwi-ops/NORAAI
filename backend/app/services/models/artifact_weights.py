"""Resolve deployable weights / ONNX for model artifacts."""

from __future__ import annotations

from app.models import ModelArtifact

ONNX_ONLY_PREFIX = "onnx-only:"


def is_onnx_only_artifact(artifact: ModelArtifact | None) -> bool:
    if not artifact:
        return False
    metrics = artifact.metrics or {}
    if metrics.get("onnx_only"):
        return True
    key = artifact.minio_weights_key or ""
    return key.startswith(ONNX_ONLY_PREFIX)


def artifact_has_onnx(artifact: ModelArtifact | None) -> bool:
    return bool(artifact and artifact.minio_onnx_key)


def artifact_has_pt_weights(artifact: ModelArtifact | None) -> bool:
    if not artifact or not artifact.minio_weights_key:
        return False
    if is_onnx_only_artifact(artifact):
        return False
    return True
