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
from app.services.datasets.auto_annotate import link_image_to_dataset_and_class_sync
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
        meta = record.extra_metadata or {}
        dataset_id_raw = meta.get("dataset_id")
        class_id_raw = meta.get("class_id")

        def _after_image_ready(img_id: uuid.UUID) -> None:
            ds_id = uuid.UUID(dataset_id_raw) if dataset_id_raw else None
            cls_id = uuid.UUID(class_id_raw) if class_id_raw else None
            link_image_to_dataset_and_class_sync(session, img_id, ds_id, cls_id)

        existing = session.query(Image).filter_by(content_hash=content_hash, project_id=record.project_id).first()
        if existing:
            if minio_key and minio_key.startswith("ingestion/temp/"):
                try:
                    from app.core.minio_client import remove_object
                    remove_object(minio_key)
                except Exception:
                    pass
            record.status = "duplicate"
            record.image_id = existing.id
            record.error_message = "Duplicate image detected"
            _after_image_ready(existing.id)
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

        final_key = f"projects/{record.project_id}/images/{content_hash[:16]}.jpg"
        temp_key = minio_key if minio_key and minio_key.startswith("ingestion/temp/") else None

        if temp_key:
            from app.core.minio_client import copy_object, remove_object

            copy_object(temp_key, final_key, "image/jpeg")
            try:
                remove_object(temp_key)
            except Exception:
                pass
        else:
            upload_bytes(final_key, image_bytes, "image/jpeg")

        minio_key = final_key

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
        _after_image_ready(image.id)
        session.commit()

        return {
            "status": "completed",
            "image_id": str(image.id),
            "quality_score": quality["overall_score"],
        }
    except Exception as exc:
        session.rollback()
        try:
            record = session.get(IngestionRecord, uuid.UUID(record_id))
            if record and record.status == "processing":
                record.status = "failed"
                record.error_message = str(exc)[:500]
                session.commit()
        except Exception:
            session.rollback()
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()


@celery_app.task(bind=True, name="workers.ingestion.tasks.import_yolo_dataset")
def import_yolo_dataset(
    self,
    minio_key: str,
    project_id: str,
    dataset_id: str,
    class_mapping: dict,
    user_id: str | None = None,
    train_after_import: bool = False,
):
    import tempfile
    from pathlib import Path

    from app.core.minio_client import download_to_path, remove_object
    from app.models import Dataset, TrainingJob, TrainingMode, ModelArchitecture
    from app.services.datasets.yolo_import import import_yolo_zip_sync
    from app.services.training.cpu_presets import DEFAULT_CPU_PRESET, build_retrain_config
    from workers.training.tasks import run_training_job

    session = SessionLocal()
    try:
        dataset = session.get(Dataset, uuid.UUID(dataset_id))
        if not dataset:
            return {"status": "failed", "error": "Dataset not found"}

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            zip_path = Path(tmp.name)

        try:
            download_to_path(minio_key, zip_path)
        except Exception as exc:
            zip_path.unlink(missing_ok=True)
            return {"status": "failed", "error": f"Archive missing from storage: {exc}"}

        def progress(meta: dict):
            self.update_state(state="PROGRESS", meta=meta)

        try:
            result = import_yolo_zip_sync(
                session,
                project_id=uuid.UUID(project_id),
                dataset_id=uuid.UUID(dataset_id),
                zip_path=zip_path,
                class_mapping=class_mapping,
                progress_callback=progress,
            )
        finally:
            zip_path.unlink(missing_ok=True)

        try:
            remove_object(minio_key)
        except Exception:
            pass

        training_job_id = None
        if train_after_import and result.imported > 0:
            dataset = session.get(Dataset, uuid.UUID(dataset_id))
            version_id = dataset.head_version_id if dataset else None
            if version_id:
                from app.services.models.active_model import get_active_model_sync
                from app.services.training.cpu_presets import CPU_PRESETS
                from app.services.training.fine_tune import recommend_preset

                artifact = get_active_model_sync(session, uuid.UUID(project_id))
                has_model = bool(artifact and not (artifact.metrics or {}).get("mock"))
                can_fine = bool(
                    artifact
                    and not (artifact.metrics or {}).get("mock")
                    and artifact.architecture in ("yolo11", "yolov10", "rt_detr")
                )
                preset = recommend_preset(has_model, can_fine)
                config = build_retrain_config(
                    epochs=CPU_PRESETS[preset]["epochs"],
                    preset=preset,
                    fine_tune_from_active=can_fine,
                )
                job = TrainingJob(
                    project_id=uuid.UUID(project_id),
                    name="YOLO Import Train",
                    architecture=ModelArchitecture.YOLO11,
                    training_mode=TrainingMode.SINGLE_GPU,
                    dataset_version_id=version_id,
                    hpo_enabled=False,
                    config=config,
                    created_by=uuid.UUID(user_id) if user_id else None,
                )
                session.add(job)
                session.commit()
                run_training_job.delay(str(job.id))
                training_job_id = str(job.id)

        return {
            "status": "completed",
            "imported": result.imported,
            "skipped": result.skipped,
            "failed": result.failed,
            "annotations": result.annotations,
            "detected_class_ids": sorted(result.detected_class_ids),
            "yolo_class_names": result.yolo_class_names,
            "errors": result.errors[:10],
            "training_job_id": training_job_id,
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
