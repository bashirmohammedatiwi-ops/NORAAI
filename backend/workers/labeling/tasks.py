import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.minio_client import download_bytes
from app.models import (
    ActiveLearningQueue,
    ActiveLearningStatus,
    Annotation,
    AnnotationStatus,
    ModelArtifact,
)
from ml.training.adapters import get_adapter
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


@celery_app.task(name="workers.labeling.tasks.auto_label_images")
def auto_label_images(project_id: str, image_ids: list[str], model_artifact_id: str):
    session = SessionLocal()
    try:
        artifact = session.get(ModelArtifact, uuid.UUID(model_artifact_id))
        if not artifact:
            return {"error": "Model not found"}

        weights = download_bytes(artifact.minio_weights_key)
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            f.write(weights)
            weights_path = f.name

        adapter = get_adapter(artifact.architecture)
        results = []
        threshold = settings.active_learning_confidence_threshold

        for img_id in image_ids:
            from app.models import Image

            image = session.get(Image, uuid.UUID(img_id))
            if not image:
                continue

            img_bytes = download_bytes(image.minio_key)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as img_f:
                img_f.write(img_bytes)
                img_path = img_f.name

            predictions = adapter.predict(weights_path, img_path)
            os.unlink(img_path)

            for pred in predictions:
                from app.models import ClassLabel

                classes = session.query(ClassLabel).filter_by(project_id=uuid.UUID(project_id)).all()
                if not classes:
                    continue
                class_id = classes[pred["class_id"] % len(classes)].id

                ann = Annotation(
                    image_id=image.id,
                    class_id=class_id,
                    x_center=pred["x_center"],
                    y_center=pred["y_center"],
                    width=pred["width"],
                    height=pred["height"],
                    confidence=pred["confidence"],
                    status=AnnotationStatus.PENDING_REVIEW,
                    source="auto_label",
                )
                session.add(ann)

                if pred["confidence"] < threshold:
                    existing = (
                        session.query(ActiveLearningQueue)
                        .filter_by(image_id=image.id, status=ActiveLearningStatus.NEEDS_REVIEW)
                        .first()
                    )
                    if not existing:
                        queue_item = ActiveLearningQueue(
                            project_id=uuid.UUID(project_id),
                            image_id=image.id,
                            model_artifact_id=artifact.id,
                            uncertainty_score=1.0 - pred["confidence"],
                            confidence=pred["confidence"],
                            status=ActiveLearningStatus.NEEDS_REVIEW,
                        )
                        session.add(queue_item)

            results.append({"image_id": img_id, "predictions": len(predictions)})

        os.unlink(weights_path)
        session.commit()
        return {"status": "completed", "results": results}
    except Exception as exc:
        session.rollback()
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()
