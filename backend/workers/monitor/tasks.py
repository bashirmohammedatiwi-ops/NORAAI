import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models import Deployment, DriftAlert, DriftAlertType, InferenceLog
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


@celery_app.task(name="workers.monitor.tasks.run_drift_checks")
def run_drift_checks():
    session = SessionLocal()
    try:
        active_deployments = (
            session.query(Deployment).filter(Deployment.status.in_(["active", "staging"])).all()
        )
        alerts_created = 0

        for deployment in active_deployments:
            since = datetime.now(timezone.utc) - timedelta(hours=24)
            logs = (
                session.query(InferenceLog)
                .filter(InferenceLog.deployment_id == deployment.id, InferenceLog.created_at >= since)
                .all()
            )
            if len(logs) < 10:
                continue

            confidences = [l.confidence for l in logs if l.confidence is not None]
            if confidences:
                mean_conf = float(np.mean(confidences))
                if mean_conf < 0.5:
                    alert = DriftAlert(
                        deployment_id=deployment.id,
                        alert_type=DriftAlertType.CONFIDENCE,
                        severity="warning",
                        message=f"Mean confidence dropped to {mean_conf:.2f}",
                        metrics={"mean_confidence": mean_conf},
                    )
                    session.add(alert)
                    alerts_created += 1

            fp_count = sum(1 for l in logs if l.is_false_positive)
            fn_count = sum(1 for l in logs if l.is_false_negative)
            if fp_count > len(logs) * 0.2:
                alert = DriftAlert(
                    deployment_id=deployment.id,
                    alert_type=DriftAlertType.ACCURACY,
                    severity="critical",
                    message=f"High false positive rate: {fp_count}/{len(logs)}",
                    metrics={"false_positives": fp_count, "total": len(logs)},
                )
                session.add(alert)
                alerts_created += 1

            if fn_count > len(logs) * 0.15:
                alert = DriftAlert(
                    deployment_id=deployment.id,
                    alert_type=DriftAlertType.ACCURACY,
                    severity="warning",
                    message=f"High false negative rate: {fn_count}/{len(logs)}",
                    metrics={"false_negatives": fn_count, "total": len(logs)},
                )
                session.add(alert)
                alerts_created += 1

        session.commit()
        return {"alerts_created": alerts_created}
    finally:
        session.close()
