import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.minio_client import upload_bytes
from app.services.training.progress import publish_training_progress
from app.models import (
    ClassLabel,
    HyperparameterTrial,
    ModelArtifact,
    ModelLifecycle,
    TrainingJob,
    TrainingMetric,
    TrainingStatus,
)
from app.services.training.cancellation import (
    TrainingCancelled,
    clear_training_cancel,
    is_training_cancelled,
    request_training_cancel,
)
from app.services.training.dataset_exporter import export_yolo_dataset_sync
from app.services.training.dataset_validator import validate_dataset_version
from ml.training.adapters import get_adapter
from ml.training.hpo import run_hpo
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


def publish_metric(job_id: str, metrics: dict):
    publish_training_progress(job_id, {
        **metrics,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _job_was_cancelled(session, job_id: str) -> bool:
    if is_training_cancelled(job_id):
        return True
    job = session.get(TrainingJob, uuid.UUID(job_id))
    return bool(job and job.status == TrainingStatus.CANCELLED)


@celery_app.task(name="workers.training.tasks.run_training_job")
def run_training_job(job_id: str):
    publish_metric(job_id, {
        "epoch": 0,
        "status": "running",
        "phase": "export",
        "message": "Training worker started",
        "progress": 1,
    })

    session = SessionLocal()
    artifact = None
    try:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if not job:
            return {"error": "Job not found"}

        job.status = TrainingStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        session.commit()

        config = dict(job.config or {})
        from app.services.training.cpu_tuning import apply_cpu_env, resolve_thread_count, tune_training_config
        from ml.training.adapters.yolo_adapter import resolve_training_device

        apply_cpu_env(resolve_thread_count())
        from app.services.training.fine_tune import (
            apply_fine_tune_training_overrides,
            resolve_fine_tune_weights_path,
        )

        config = apply_fine_tune_training_overrides(tune_training_config(config))
        from app.services.training.cpu_tuning import speed_boost_summary

        boost_msg = speed_boost_summary(config)
        if boost_msg:
            config["_speed_boost_note"] = boost_msg
        job.config = config
        session.commit()
        config["device"] = resolve_training_device(config)
        adapter = get_adapter(job.architecture.value)

        def cancel_check() -> bool:
            return _job_was_cancelled(session, job_id)

        from app.services.training.workspace import fast_training_workspace

        with fast_training_workspace(job_id) as tmpdir:
            def progress_callback(m: dict):
                publish_metric(job_id, m)

            def metrics_callback(m: dict):
                publish_metric(job_id, m)
                if not m.get("save_epoch_metric"):
                    return
                metric = TrainingMetric(
                    training_job_id=job.id,
                    epoch=m["epoch"],
                    loss=m.get("loss"),
                    precision=m.get("precision"),
                    recall=m.get("recall"),
                    f1=m.get("f1"),
                    map50=m.get("map50"),
                    map50_95=m.get("map50_95"),
                )
                session.add(metric)
                session.commit()

            publish_metric(job_id, {
                "epoch": 0,
                "status": "running",
                "phase": "export",
                "message": "Preparing dataset",
                "progress": 2,
            })

            export_meta: dict = {}
            validation: dict | None = None
            selected_class_ids = config.get("class_ids") or None
            if selected_class_ids:
                selected_class_ids = [str(cid) for cid in selected_class_ids]

            if job.dataset_version_id:
                validation = validate_dataset_version(
                    session,
                    job.dataset_version_id,
                    selected_class_ids=selected_class_ids,
                )
                publish_metric(job_id, {
                    "phase": "validate",
                    "message": "Dataset validated",
                    "dataset_validation": validation,
                    "progress": 4,
                    "status": "running",
                })
                if not validation["valid"]:
                    raise ValueError("; ".join(validation["errors"]))

                yaml_path, class_names, export_meta = export_yolo_dataset_sync(
                    session,
                    job.dataset_version_id,
                    tmpdir,
                    config.get("val_split", 0.2),
                    progress_callback=progress_callback,
                    cancel_check=cancel_check,
                    max_workers=config.get("_export_workers") or settings.training_export_max_workers or None,
                    selected_class_ids=selected_class_ids,
                )
                train_n = int(export_meta.get("train_images") or 0)
                val_n = int(export_meta.get("val_images") or 0)
                exported_n = int(export_meta.get("exported_images") or 0)
                config["_train_images"] = train_n
                config["_val_images"] = val_n
                config["_exported_images"] = exported_n
                if train_n >= 2000:
                    config["cache"] = "disk"
                    config["prefer_disk_cache"] = True
                job.config = dict(config)
                session.commit()
                expected_n = int((validation.get("stats") or {}).get("image_count") or 0)
                publish_metric(job_id, {
                    "phase": "export",
                    "message": f"Exported {exported_n} images · train {train_n} · val {val_n}",
                    "export_current": exported_n,
                    "export_total": expected_n or exported_n,
                    "train_images": train_n,
                    "val_images": val_n,
                    "exported_images": exported_n,
                    "progress": 14,
                    "status": "running",
                })
                labeled_n = int((validation.get("stats") or {}).get("labeled_images") or 0)
                labeled_export = int(export_meta.get("labeled_train_images") or 0) + int(
                    export_meta.get("labeled_val_images") or 0
                )
                publish_metric(job_id, {
                    "phase": "validate",
                    "message": (
                        f"Labels: {labeled_n} labeled in DB · {labeled_export} exported with boxes"
                    ),
                    "status": "running",
                })
                if expected_n and exported_n < max(10, int(expected_n * 0.9)):
                    raise ValueError(
                        f"Dataset export incomplete: only {exported_n}/{expected_n} images "
                        f"downloaded from MinIO ({export_meta.get('export_failures', 0)} failed). "
                        "Fix storage connectivity before training."
                    )
                if labeled_export < max(50, int(exported_n * 0.05)) and exported_n >= 100:
                    raise ValueError(
                        f"Only {labeled_export}/{exported_n} exported images have label boxes — "
                        f"({labeled_n} labeled in DB). Import YOLO labels or approve annotations."
                    )
                for warning in validation.get("warnings", []):
                    publish_metric(job_id, {
                        "phase": "validate",
                        "message": warning,
                        "status": "running",
                    })
            else:
                yaml_path = os.path.join(tmpdir, "data.yaml")
                Path(yaml_path).write_text(
                    f"path: {tmpdir}\ntrain: images/train\nval: images/val\nnc: 1\nnames: ['object']\n"
                )
                for split in ("train", "val"):
                    os.makedirs(os.path.join(tmpdir, "images", split), exist_ok=True)
                class_names = ["object"]

            if cancel_check():
                raise TrainingCancelled("Training cancelled")

            fine_tune_path, fine_tune_source, fine_tune_warning = resolve_fine_tune_weights_path(
                session,
                job.project_id,
                job.architecture.value,
                config,
                work_dir=tmpdir,
            )
            if fine_tune_path:
                config["_fine_tune_weights_path"] = fine_tune_path
                config["_fine_tune_source"] = fine_tune_source
                from app.services.training.fine_tune import apply_fine_tune_training_overrides

                apply_fine_tune_training_overrides(config, from_main_model=True)
                job.config = dict(config)
                session.commit()
            export_note = ""
            if export_meta:
                train_n = int(export_meta.get("train_images") or 0)
                val_n = int(export_meta.get("val_images") or 0)
                export_note = f"Dataset: {train_n} train · {val_n} val"
            setup_msg = (
                "Fine-tuning from Main Model"
                if fine_tune_source == "main_model"
                else (
                    fine_tune_warning
                    or f"CPU tune: {config.get('cpu_threads')} threads · batch {config.get('batch_size')}"
                )
            )
            if export_note:
                setup_msg = f"{export_note} · {setup_msg}"
            if config.get("_speed_boost_note"):
                setup_msg = f"{setup_msg} · {config['_speed_boost_note']}"
            publish_metric(job_id, {
                "phase": "setup",
                "message": setup_msg,
                "fine_tune_source": fine_tune_source,
                "progress": 5,
                "status": "running",
            })
            if fine_tune_warning and fine_tune_source != "main_model":
                publish_metric(job_id, {
                    "phase": "setup",
                    "message": fine_tune_warning,
                    "status": "running",
                })

            if job.hpo_enabled:
                def hpo_train_fn(params):
                    if cancel_check():
                        raise TrainingCancelled("Training cancelled")
                    trial_config = {**config, **params}
                    result = adapter.train(yaml_path, tmpdir, trial_config, metrics_callback, cancel_check)
                    trial_num = session.query(HyperparameterTrial).filter_by(training_job_id=job.id).count() + 1
                    trial = HyperparameterTrial(
                        training_job_id=job.id,
                        trial_number=trial_num,
                        params=params,
                        metrics=result.get("metrics", {}),
                        status="completed",
                    )
                    session.add(trial)
                    session.commit()
                    return result.get("metrics", {}).get("map50_95", 0.0)

                run_hpo(config.get("hpo_trials", 5), hpo_train_fn, f"job_{job_id}")
                trials = session.query(HyperparameterTrial).filter_by(training_job_id=job.id).all()
                if trials:
                    session.query(HyperparameterTrial).filter_by(training_job_id=job.id).update({"is_best": False})
                    best_trial = max(
                        trials,
                        key=lambda t: (t.metrics or {}).get("map50_95", 0),
                    )
                    best_trial.is_best = True
                    config = {**config, **best_trial.params}
                    session.commit()

            if cancel_check():
                raise TrainingCancelled("Training cancelled")

            result = adapter.train(yaml_path, tmpdir, config, metrics_callback, cancel_check)

            if cancel_check():
                raise TrainingCancelled("Training cancelled")

            publish_metric(job_id, {
                "phase": "finalize",
                "message": "Saving model weights…",
                "progress": 99,
                "status": "running",
            })

            weights_path = result["weights_path"]
            weights_bytes = Path(weights_path).read_bytes() if Path(weights_path).exists() else b"mock"
            minio_key = f"projects/{job.project_id}/models/{job.id}/best.pt"
            upload_bytes(minio_key, weights_bytes, "application/octet-stream")
            try:
                from app.services.inference.model_cache import invalidate_weights

                invalidate_weights(minio_key)
            except Exception:
                pass

            onnx_key: str | None = None
            skip_onnx = settings.training_skip_onnx_export or str(config.get("device", "cpu")) == "cpu"
            if not skip_onnx:
                onnx_path = os.path.join(tmpdir, "model.onnx")
                adapter.export_onnx(weights_path, onnx_path)
                if os.path.exists(onnx_path):
                    onnx_key = f"projects/{job.project_id}/models/{job.id}/model.onnx"
                    upload_bytes(onnx_key, Path(onnx_path).read_bytes(), "application/octet-stream")

            classes_used = class_names
            if job.dataset_version_id is None:
                cls_result = (
                    session.query(ClassLabel)
                    .filter_by(project_id=job.project_id, is_archived=False)
                    .order_by(ClassLabel.created_at, ClassLabel.name)
                    .all()
                )
                classes_used = [c.name for c in cls_result]

            training_metrics = dict(result.get("metrics", {}))
            training_metrics["image_size"] = config.get("image_size", 640)
            training_metrics["fine_tune_source"] = config.get("_fine_tune_source") or result.get("fine_tuned_from", "pretrained")
            training_metrics["class_manifest"] = export_meta or {"names": classes_used}
            training_metrics["dataset_validation"] = (
                validation.get("stats") if validation else None
            )

            artifact = ModelArtifact(
                project_id=job.project_id,
                training_job_id=job.id,
                name="Main Model",
                architecture=job.architecture.value,
                lifecycle=ModelLifecycle.REGISTERED,
                minio_weights_key=minio_key,
                minio_onnx_key=onnx_key,
                dataset_version_id=job.dataset_version_id,
                classes_used=classes_used,
                metrics=training_metrics,
                gpu_used=str(config.get("device", "cpu")),
                training_duration_seconds=result.get("duration_seconds"),
                model_size_mb=len(weights_bytes) / (1024 * 1024),
            )
            session.add(artifact)
            session.flush()

            from app.services.models.active_model import ensure_live_deployment_sync, promote_as_active_model_sync

            promote_as_active_model_sync(session, job.project_id, artifact.id)
            ensure_live_deployment_sync(session, job.project_id, artifact.id)

        job.status = TrainingStatus.COMPLETED
        job.completed_at = datetime.now(timezone.utc)
        session.commit()
        publish_metric(job_id, {"epoch": config.get("epochs", 50), "status": "completed", "artifact_id": str(artifact.id)})
        clear_training_cancel(job_id)
        return {"status": "completed", "artifact_id": str(artifact.id)}
    except TrainingCancelled:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if job:
            job.status = TrainingStatus.CANCELLED
            job.completed_at = datetime.now(timezone.utc)
            session.commit()
        publish_metric(job_id, {"status": "cancelled", "message": "Training stopped"})
        clear_training_cancel(job_id)
        return {"status": "cancelled"}
    except Exception as exc:
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if job:
            job.status = TrainingStatus.FAILED
            job.error_message = str(exc)
            session.commit()
        publish_metric(job_id, {"status": "failed", "error": str(exc)})
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()


@celery_app.task(name="workers.training.tasks.cancel_training_job")
def cancel_training_job(job_id: str):
    session = SessionLocal()
    try:
        request_training_cancel(job_id)
        job = session.get(TrainingJob, uuid.UUID(job_id))
        if job:
            if job.celery_task_id:
                celery_app.control.revoke(job.celery_task_id, terminate=True, signal="SIGTERM")
            if job.status in (TrainingStatus.PENDING, TrainingStatus.RUNNING):
                job.status = TrainingStatus.CANCELLED
                job.completed_at = datetime.now(timezone.utc)
                session.commit()
                publish_metric(job_id, {"status": "cancelled", "message": "Training stopped"})
        return {"status": "cancelled"}
    finally:
        session.close()
