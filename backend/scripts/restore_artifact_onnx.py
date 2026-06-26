"""Upload a local ONNX file into MinIO for an existing model artifact.

Use when the database references an ONNX key that was lost (MinIO reset, failed upload).

Usage (on VPS, from /opt/aiops):

  docker compose -f docker-compose.prod.yml cp ./model.onnx api:/tmp/model.onnx
  docker compose -f docker-compose.prod.yml exec -T api \\
    python scripts/restore_artifact_onnx.py \\
    <project_id> <artifact_id> /tmp/model.onnx
"""

from __future__ import annotations

import argparse
import asyncio
import uuid
from pathlib import Path

from app.core.minio_client import upload_bytes
from app.core.database import async_session
from app.models import ModelArtifact
from app.services.models.artifact_weights import (
    MIN_ONNX_BYTES,
    artifact_storage_status,
    repair_artifact_storage_keys,
)
from app.services.models.import_model import _validate_onnx_bytes


async def restore(project_id: uuid.UUID, artifact_id: uuid.UUID, onnx_path: Path) -> None:
    data = onnx_path.read_bytes()
    _validate_onnx_bytes(data)

    async with async_session() as db:
        art = await db.get(ModelArtifact, artifact_id)
        if not art or art.project_id != project_id:
            raise SystemExit(f"Artifact not found: {artifact_id} in project {project_id}")

        target_key = art.minio_onnx_key or f"projects/{project_id}/models/imported/{artifact_id}.onnx"
        upload_bytes(target_key, data, "application/octet-stream")
        art.minio_onnx_key = target_key
        repair_artifact_storage_keys(art)
        await db.commit()

        status = artifact_storage_status(art)
        print(f"Uploaded {len(data)} bytes → {target_key}")
        print(f"Artifact: {art.name!r} ({artifact_id})")
        print(f"Storage ready: {status['storage_ready']}  onnx: {status.get('onnx_key')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore missing ONNX for a model artifact")
    parser.add_argument("project_id")
    parser.add_argument("artifact_id")
    parser.add_argument("onnx_path", type=Path)
    args = parser.parse_args()

    path = args.onnx_path
    if not path.is_file():
        raise SystemExit(f"File not found: {path}")
    if path.stat().st_size < MIN_ONNX_BYTES:
        raise SystemExit(f"ONNX too small (< {MIN_ONNX_BYTES} bytes): {path}")

    asyncio.run(restore(uuid.UUID(args.project_id), uuid.UUID(args.artifact_id), path))


if __name__ == "__main__":
    main()
