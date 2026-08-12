"""Attach local demo images to seeded road events by reference filename."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RoadEvent
from app.services.demo.iraq_demo_seed import DEMO_MARKER

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


async def attach_demo_images(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    source_dir: Path,
    upload_dir: Path,
) -> dict:
    if not source_dir.is_dir():
        return {"attached": 0, "skipped": 0, "reason": "source_missing", "source": str(source_dir)}

    upload_dir.mkdir(parents=True, exist_ok=True)

    result = await db.execute(
        select(RoadEvent).where(RoadEvent.project_id == project_id, RoadEvent.is_active == True)
    )
    events = list(result.scalars().all())
    by_reference: dict[str, RoadEvent] = {}
    for event in events:
        meta = event.extra_metadata or {}
        if meta.get("demo_batch") != DEMO_MARKER:
            continue
        ref = meta.get("reference")
        if isinstance(ref, str) and ref.strip():
            by_reference[ref.strip().upper()] = event

    attached = 0
    skipped = 0
    matched: list[str] = []

    for path in sorted(source_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        key = path.stem.strip().upper()
        event = by_reference.get(key)
        if not event:
            skipped += 1
            continue

        ext = path.suffix.lower()
        if ext == ".jpeg":
            ext = ".jpg"
        filename = f"{event.id}{ext}"
        dest = upload_dir / filename
        shutil.copy2(path, dest)

        meta = dict(event.extra_metadata or {})
        meta["image_url"] = f"/uploads/evidence/{filename}"
        event.extra_metadata = meta
        attached += 1
        matched.append(key)

    await db.flush()
    return {
        "attached": attached,
        "skipped": skipped,
        "matched": matched,
        "source": str(source_dir),
    }
