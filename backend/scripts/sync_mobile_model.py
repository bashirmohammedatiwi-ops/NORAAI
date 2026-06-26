"""Publish a model artifact to the mobile app (export ONNX + manifest).

Usage (on VPS):
  docker compose -f docker-compose.prod.yml exec -T api \\
    python scripts/sync_mobile_model.py <project_id> <artifact_id>

List deployable models:
  docker compose -f docker-compose.prod.yml exec -T api \\
    python scripts/sync_mobile_model.py --list <project_id>
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid

from sqlalchemy import select

from app.core.database import async_session
from app.models import ModelArtifact, Project
from app.services.driver.project_classes import is_production_model
from app.services.mobile.driver_deploy import sync_driver_model


async def list_models(project_id: uuid.UUID) -> None:
    async with async_session() as db:
        project = await db.get(Project, project_id)
        if not project:
            raise SystemExit(f"Project not found: {project_id}")

        result = await db.execute(
            select(ModelArtifact)
            .where(ModelArtifact.project_id == project_id)
            .order_by(ModelArtifact.created_at.desc())
        )
        artifacts = list(result.scalars().all())
        print(f"Project: {project.name} ({project_id})")
        print(f"Driver model: {project.driver_model_artifact_id or '—'}")
        print()
        for art in artifacts:
            if not is_production_model(art):
                continue
            onnx = "onnx" if art.minio_onnx_key else "pt-only"
            deployed = "✓ mobile" if project.driver_model_artifact_id == art.id else ""
            print(
                f"  {art.id}  {art.name!r}  {art.architecture}  [{onnx}]  {deployed}"
            )


async def run_sync(
    project_id: uuid.UUID,
    artifact_id: uuid.UUID,
    *,
    promote_active: bool,
) -> None:
    async with async_session() as db:
        project = await db.get(Project, project_id)
        if not project:
            raise SystemExit(f"Project not found: {project_id}")

        manifest = await sync_driver_model(
            db,
            project,
            artifact_id,
            promote_active=promote_active,
        )
        await db.commit()
        print("Mobile sync OK")
        print(f"  artifact: {manifest['artifact_id']}")
        print(f"  version:  {manifest['version']}")
        print(f"  sha256:   {manifest['sha256']}")
        print(f"  size_mb:  {manifest.get('model_size_mb')}")
        print(f"  classes:  {', '.join(manifest.get('classes') or [])}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync model to mobile app")
    parser.add_argument("project_id", nargs="?", help="Project UUID")
    parser.add_argument("artifact_id", nargs="?", help="Model artifact UUID")
    parser.add_argument("--list", action="store_true", help="List deployable models")
    parser.add_argument(
        "--promote-active",
        action="store_true",
        help="Also set as unified active (Main Model)",
    )
    args = parser.parse_args()

    if args.list:
        if not args.project_id:
            raise SystemExit("Provide project_id with --list")
        asyncio.run(list_models(uuid.UUID(args.project_id)))
        return

    if not args.project_id or not args.artifact_id:
        parser.print_help()
        raise SystemExit(2)

    asyncio.run(
        run_sync(
            uuid.UUID(args.project_id),
            uuid.UUID(args.artifact_id),
            promote_active=args.promote_active,
        )
    )


if __name__ == "__main__":
    main()
