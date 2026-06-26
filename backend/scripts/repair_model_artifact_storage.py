"""Repair MinIO keys for model artifacts when stored paths are stale.

Usage:
  docker compose -f docker-compose.prod.yml exec -T api \\
    python scripts/repair_model_artifact_storage.py <project_id>

  docker compose -f docker-compose.prod.yml exec -T api \\
    python scripts/repair_model_artifact_storage.py <project_id> <artifact_id>
"""

from __future__ import annotations

import argparse
import asyncio
import uuid

from sqlalchemy import select

from app.core.database import async_session
from app.models import ModelArtifact, Project
from app.services.models.artifact_weights import artifact_storage_status, repair_artifact_storage_keys


async def repair(project_id: uuid.UUID, artifact_id: uuid.UUID | None) -> None:
    async with async_session() as db:
        project = await db.get(Project, project_id)
        if not project:
            raise SystemExit(f"Project not found: {project_id}")

        query = select(ModelArtifact).where(ModelArtifact.project_id == project_id)
        if artifact_id:
            query = query.where(ModelArtifact.id == artifact_id)

        result = await db.execute(query.order_by(ModelArtifact.created_at.desc()))
        artifacts = list(result.scalars().all())
        if not artifacts:
            raise SystemExit("No model artifacts found")

        print(f"Project: {project.name} ({project_id})")
        fixed = 0
        for art in artifacts:
            status_before = artifact_storage_status(art)
            changed = repair_artifact_storage_keys(art)
            status_after = artifact_storage_status(art)
            flag = "FIXED" if changed else ("OK" if status_after["storage_ready"] else "MISSING")
            print(
                f"  [{flag}] {art.id}  {art.name!r}\n"
                f"         weights: {status_after.get('weights_key') or '—'}\n"
                f"         onnx:    {status_after.get('onnx_key') or '—'}"
            )
            if changed:
                fixed += 1
            elif not status_before["storage_ready"] and not status_after["storage_ready"]:
                print("         → re-import .pt/.onnx from Unified Model page")

        if fixed:
            await db.commit()
            print(f"\nUpdated {fixed} artifact(s).")
        else:
            print("\nNo database keys changed.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair model artifact MinIO keys")
    parser.add_argument("project_id", help="Project UUID")
    parser.add_argument("artifact_id", nargs="?", help="Optional artifact UUID")
    args = parser.parse_args()

    artifact_id = uuid.UUID(args.artifact_id) if args.artifact_id else None
    asyncio.run(repair(uuid.UUID(args.project_id), artifact_id))


if __name__ == "__main__":
    main()
