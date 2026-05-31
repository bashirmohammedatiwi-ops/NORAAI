import hashlib
import uuid
from io import BytesIO

import imagehash
from PIL import Image as PILImage
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.minio_client import download_bytes, upload_bytes
from app.models import (
    Image,
    ImageQualityScore,
    ImageStatus,
    IngestionRecord,
    IngestionSourceType,
)
from ml.quality.scorer import assess_image_quality, extract_gps_from_exif
from app.services.datasets.dataset_images import append_images_to_dataset_sync
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


@celery_app.task(name="workers.ingestion.tasks.process_image")
def process_image(record_id: str, image_bytes_b64: str | None = None, minio_key: str | None = None):
    session = SessionLocal()
    try:
        record = session.get(IngestionRecord, uuid.UUID(record_id))
        if not record:
            return {"error": "Record not found"}

        if minio_key:
            image_bytes = download_bytes(minio_key)
        else:
            import base64
            image_bytes = base64.b64decode(image_bytes_b64)

        content_hash = hashlib.sha256(image_bytes).hexdigest()
        dataset_id_raw = (record.extra_metadata or {}).get("dataset_id")

        existing = session.query(Image).filter_by(content_hash=content_hash, project_id=record.project_id).first()
        if existing:
            record.status = "duplicate"
            record.image_id = existing.id
            record.error_message = "Duplicate image detected"
            if dataset_id_raw:
                append_images_to_dataset_sync(session, uuid.UUID(dataset_id_raw), [existing.id])
            session.commit()
            return {"status": "duplicate", "image_id": str(existing.id)}

        try:
            pil = PILImage.open(BytesIO(image_bytes))
            width, height = pil.size
            phash = str(imagehash.phash(pil))
        except Exception:
            record.status = "failed"
            record.error_message = "Corrupted image file"
            session.commit()
            return {"status": "failed", "error": "corrupted"}

        quality = assess_image_quality(image_bytes)
        lat, lon = extract_gps_from_exif(image_bytes)

        minio_key = f"projects/{record.project_id}/images/{content_hash[:16]}.jpg"
        upload_bytes(minio_key, image_bytes, "image/jpeg")

        status = ImageStatus.VALIDATED
        if quality["is_corrupted"] or quality["overall_score"] < settings.quality_score_threshold:
            status = ImageStatus.FLAGGED if quality["overall_score"] >= 20 else ImageStatus.REJECTED

        image = Image(
            project_id=record.project_id,
            filename=f"{content_hash[:16]}.jpg",
            content_hash=content_hash,
            phash=phash,
            minio_key=minio_key,
            width=width,
            height=height,
            latitude=lat,
            longitude=lon,
            status=status,
            source_type=record.source_type,
        )
        session.add(image)
        session.flush()

        score = ImageQualityScore(
            image_id=image.id,
            overall_score=quality["overall_score"],
            blur_score=quality["blur_score"],
            brightness_score=quality["brightness_score"],
            resolution_score=quality["resolution_score"],
            is_corrupted=quality["is_corrupted"],
            details=quality["details"],
        )
        session.add(score)

        record.status = "completed"
        record.image_id = image.id

        if dataset_id_raw:
            append_images_to_dataset_sync(session, uuid.UUID(dataset_id_raw), [image.id])

        session.commit()

        return {
            "status": "completed",
            "image_id": str(image.id),
            "quality_score": quality["overall_score"],
        }
    except Exception as exc:
        session.rollback()
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()


@celery_app.task(name="workers.ingestion.tasks.pull_camera_snapshot")
def pull_camera_snapshot(config_id: str, project_id: str, url: str, source_type: str):
    import httpx

    session = SessionLocal()
    try:
        response = httpx.get(url, timeout=30)
        response.raise_for_status()
        record = IngestionRecord(
            project_id=uuid.UUID(project_id),
            source_type=IngestionSourceType(source_type),
            source_id=config_id,
            status="processing",
        )
        session.add(record)
        session.commit()
        process_image.delay(str(record.id), minio_key=None, image_bytes_b64=None)
        import base64
        process_image(str(record.id), base64.b64encode(response.content).decode())
        return {"status": "queued", "record_id": str(record.id)}
    finally:
        session.close()
