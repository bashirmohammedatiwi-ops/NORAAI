from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "aiops",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "workers.ingestion.tasks",
        "workers.labeling.tasks",
        "workers.training.tasks",
        "workers.deploy.tasks",
        "workers.monitor.tasks",
        "workers.reports.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "workers.ingestion.*": {"queue": "ingestion"},
        "workers.labeling.*": {"queue": "labeling"},
        "workers.training.*": {"queue": "training"},
        "workers.deploy.*": {"queue": "deploy"},
        "workers.monitor.*": {"queue": "monitor"},
        "workers.reports.*": {"queue": "reports"},
    },
    beat_schedule={
        "drift-check-hourly": {
            "task": "workers.monitor.tasks.run_drift_checks",
            "schedule": crontab(minute=0),
        },
        "weekly-report": {
            "task": "workers.reports.tasks.generate_scheduled_reports",
            "schedule": crontab(day_of_week=1, hour=6, minute=0),
            "kwargs": {"report_type": "weekly"},
        },
        "monthly-report": {
            "task": "workers.reports.tasks.generate_scheduled_reports",
            "schedule": crontab(day_of_month=1, hour=6, minute=0),
            "kwargs": {"report_type": "monthly"},
        },
    },
)
