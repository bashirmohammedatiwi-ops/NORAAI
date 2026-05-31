"""Permanent deletion with password confirmation."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import get_minio
from app.core.config import get_settings
from app.models import (
    ActiveLearningQueue,
    Annotation,
    AnnotationReview,
    ClassAuditLog,
    ClassLabel,
    Dataset,
    DatasetBranch,
    DatasetImage,
    DatasetVersion,
    DatasetVersionDiff,
    Deployment,
    DeviceTelemetry,
    DriftAlert,
    EvaluationResult,
    FleetDevice,
    HyperparameterTrial,
    Image,
    ImageQualityScore,
    InferenceLog,
    IngestionRecord,
    IngestionSourceConfig,
    ModelArtifact,
    ModelDefinition,
    Project,
    Report,
    RoadEvent,
    TrainingJob,
    TrainingMetric,
)


def _delete_minio_key(key: str) -> None:
    if not key:
        return
    try:
        client = get_minio()
        settings = get_settings()
        if client.bucket_exists(settings.minio_bucket):
            client.remove_object(settings.minio_bucket, key)
    except Exception:
        pass


async def _collect_dataset_image_ids(db: AsyncSession, dataset_id: uuid.UUID) -> set[uuid.UUID]:
    image_ids: set[uuid.UUID] = set()
    versions = await db.execute(select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id))
    for version in versions.scalars().all():
        for raw in version.manifest.get("image_ids", []):
            image_ids.add(uuid.UUID(str(raw)))
        links = await db.execute(select(DatasetImage.image_id).where(DatasetImage.version_id == version.id))
        image_ids.update(row[0] for row in links.all())
    return image_ids


async def _delete_images(db: AsyncSession, image_ids: set[uuid.UUID]) -> int:
    if not image_ids:
        return 0

    ids = list(image_ids)
    images = await db.execute(select(Image).where(Image.id.in_(ids)))
    for img in images.scalars().all():
        _delete_minio_key(img.minio_key)

    ann_ids = await db.execute(select(Annotation.id).where(Annotation.image_id.in_(ids)))
    ann_id_list = [row[0] for row in ann_ids.all()]
    if ann_id_list:
        await db.execute(delete(AnnotationReview).where(AnnotationReview.annotation_id.in_(ann_id_list)))
    await db.execute(delete(Annotation).where(Annotation.image_id.in_(ids)))
    await db.execute(delete(ActiveLearningQueue).where(ActiveLearningQueue.image_id.in_(ids)))
    await db.execute(delete(DatasetImage).where(DatasetImage.image_id.in_(ids)))
    await db.execute(delete(ImageQualityScore).where(ImageQualityScore.image_id.in_(ids)))
    await db.execute(
        update(IngestionRecord).where(IngestionRecord.image_id.in_(ids)).values(image_id=None)
    )
    result = await db.execute(delete(Image).where(Image.id.in_(ids)))
    return result.rowcount or 0


async def _delete_dataset_structure(db: AsyncSession, dataset_id: uuid.UUID) -> None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return

    dataset.head_version_id = None
    await db.flush()

    version_ids = [
        row[0]
        for row in (
            await db.execute(select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id))
        ).all()
    ]

    if version_ids:
        await db.execute(delete(DatasetImage).where(DatasetImage.version_id.in_(version_ids)))
        await db.execute(
            delete(DatasetVersionDiff).where(
                (DatasetVersionDiff.from_version_id.in_(version_ids))
                | (DatasetVersionDiff.to_version_id.in_(version_ids))
            )
        )
        await db.execute(delete(DatasetVersion).where(DatasetVersion.id.in_(version_ids)))

    await db.execute(delete(DatasetBranch).where(DatasetBranch.dataset_id == dataset_id))
    await db.execute(delete(DatasetVersionDiff).where(DatasetVersionDiff.dataset_id == dataset_id))
    await db.execute(delete(Dataset).where(Dataset.id == dataset_id))


async def delete_class_permanently(
    db: AsyncSession, project_id: uuid.UUID, class_id: uuid.UUID
) -> dict:
    cls = await db.get(ClassLabel, class_id)
    if not cls or cls.project_id != project_id:
        raise ValueError("Class not found")

    ann_ids = [
        row[0]
        for row in (await db.execute(select(Annotation.id).where(Annotation.class_id == class_id))).all()
    ]
    if ann_ids:
        await db.execute(delete(AnnotationReview).where(AnnotationReview.annotation_id.in_(ann_ids)))
    ann_count = (
        await db.execute(delete(Annotation).where(Annotation.class_id == class_id))
    ).rowcount or 0

    await db.execute(delete(ClassLabel).where(ClassLabel.id == class_id))
    await db.flush()

    return {
        "deleted": "class",
        "class_id": str(class_id),
        "class_name": cls.name,
        "annotations_removed": ann_count,
    }


async def delete_dataset_permanently(db: AsyncSession, dataset_id: uuid.UUID) -> dict:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise ValueError("Dataset not found")

    image_ids = await _collect_dataset_image_ids(db, dataset_id)
    images_removed = await _delete_images(db, image_ids)
    await _delete_dataset_structure(db, dataset_id)
    await db.flush()

    return {
        "deleted": "dataset",
        "dataset_id": str(dataset_id),
        "dataset_name": dataset.name,
        "images_removed": images_removed,
    }


async def delete_project_permanently(
    db: AsyncSession, project_id: uuid.UUID, organization_id: uuid.UUID
) -> dict:
    project = await db.get(Project, project_id)
    if not project or project.organization_id != organization_id:
        raise ValueError("Project not found")

    project.active_model_artifact_id = None
    await db.flush()

    deployment_ids = [
        row[0]
        for row in (await db.execute(select(Deployment.id).where(Deployment.project_id == project_id))).all()
    ]
    if deployment_ids:
        await db.execute(delete(InferenceLog).where(InferenceLog.deployment_id.in_(deployment_ids)))
        await db.execute(delete(DriftAlert).where(DriftAlert.deployment_id.in_(deployment_ids)))
        await db.execute(delete(Deployment).where(Deployment.id.in_(deployment_ids)))

    artifact_ids = [
        row[0]
        for row in (await db.execute(select(ModelArtifact.id).where(ModelArtifact.project_id == project_id))).all()
    ]
    if artifact_ids:
        await db.execute(delete(EvaluationResult).where(EvaluationResult.model_artifact_id.in_(artifact_ids)))
        for art in (await db.execute(select(ModelArtifact).where(ModelArtifact.id.in_(artifact_ids)))).scalars():
            _delete_minio_key(art.minio_weights_key)
            _delete_minio_key(art.minio_onnx_key or "")
        await db.execute(delete(ModelArtifact).where(ModelArtifact.id.in_(artifact_ids)))

    job_ids = [
        row[0]
        for row in (await db.execute(select(TrainingJob.id).where(TrainingJob.project_id == project_id))).all()
    ]
    if job_ids:
        await db.execute(delete(TrainingMetric).where(TrainingMetric.training_job_id.in_(job_ids)))
        await db.execute(delete(HyperparameterTrial).where(HyperparameterTrial.training_job_id.in_(job_ids)))
        await db.execute(delete(TrainingJob).where(TrainingJob.id.in_(job_ids)))

    datasets = await db.execute(select(Dataset.id).where(Dataset.project_id == project_id))
    for (ds_id,) in datasets.all():
        await delete_dataset_permanently(db, ds_id)

    image_ids = {
        row[0] for row in (await db.execute(select(Image.id).where(Image.project_id == project_id))).all()
    }
    images_removed = await _delete_images(db, image_ids)

    await db.execute(delete(IngestionRecord).where(IngestionRecord.project_id == project_id))
    await db.execute(delete(ClassAuditLog).where(ClassAuditLog.project_id == project_id))
    await db.execute(delete(ClassLabel).where(ClassLabel.project_id == project_id))
    await db.execute(delete(ModelDefinition).where(ModelDefinition.project_id == project_id))
    await db.execute(delete(IngestionSourceConfig).where(IngestionSourceConfig.project_id == project_id))
    await db.execute(delete(Report).where(Report.project_id == project_id))
    await db.execute(delete(RoadEvent).where(RoadEvent.project_id == project_id))

    device_ids = [
        row[0]
        for row in (await db.execute(select(FleetDevice.id).where(FleetDevice.project_id == project_id))).all()
    ]
    if device_ids:
        await db.execute(delete(DeviceTelemetry).where(DeviceTelemetry.device_id.in_(device_ids)))
        await db.execute(delete(FleetDevice).where(FleetDevice.id.in_(device_ids)))

    await db.execute(delete(Project).where(Project.id == project_id))
    await db.flush()

    return {
        "deleted": "project",
        "project_id": str(project_id),
        "project_name": project.name,
        "images_removed": images_removed,
    }
