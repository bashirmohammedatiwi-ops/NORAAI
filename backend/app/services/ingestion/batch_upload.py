"""Fast parallel ingestion: batch DB flush + parallel MinIO uploads + Celery queue."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import upload_bytes
from app.models import IngestionRecord, IngestionSourceType
from workers.ingestion.tasks import process_image

# Shared pool for blocking MinIO PUTs (avoid blocking the async event loop).
_upload_executor = ThreadPoolExecutor(max_workers=12, thread_name_prefix="minio-upload")


@dataclass(frozen=True)
class FilePayload:
    content: bytes
    content_type: str


def _put_minio(key: str, data: bytes, content_type: str) -> None:
    upload_bytes(key, data, content_type)


async def ingest_files_parallel(
    db: AsyncSession,
    *,
    project_id: UUID,
    source_type: IngestionSourceType,
    source_id: str,
    files: list[FilePayload],
    extra_metadata: dict | None = None,
) -> list[UUID]:
    """Create ingestion records, upload to MinIO in parallel, queue Celery workers."""
    if not files:
        return []

    meta = dict(extra_metadata or {})
    pending: list[tuple[IngestionRecord, FilePayload]] = []

    for payload in files:
        record = IngestionRecord(
            project_id=project_id,
            source_type=source_type,
            source_id=source_id,
            status="processing",
            extra_metadata=meta,
        )
        db.add(record)
        pending.append((record, payload))

    await db.flush()

    loop = asyncio.get_running_loop()
    upload_tasks = []
    keys: list[str] = []

    for record, payload in pending:
        key = f"ingestion/temp/{record.id}"
        keys.append(key)
        upload_tasks.append(
            loop.run_in_executor(
                _upload_executor,
                _put_minio,
                key,
                payload.content,
                payload.content_type or "image/jpeg",
            )
        )

    # Avoid saturating MinIO/disk with huge single-request bursts.
    chunk_size = 4
    for i in range(0, len(upload_tasks), chunk_size):
        await asyncio.gather(*upload_tasks[i : i + chunk_size])

    record_ids: list[UUID] = []
    for (record, _), key in zip(pending, keys):
        process_image.delay(str(record.id), minio_key=key)
        record_ids.append(record.id)

    return record_ids
