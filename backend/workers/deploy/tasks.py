import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models import Deployment, DeploymentStatus
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


@celery_app.task(name="workers.deploy.tasks.deploy_model")
def deploy_model(deployment_id: str):
    session = SessionLocal()
    try:
        deployment = session.get(Deployment, uuid.UUID(deployment_id))
        if not deployment:
            return {"error": "Deployment not found"}

        target = deployment.target.value
        config = deployment.config or {}

        if target == "docker":
            endpoint = f"http://localhost:8080/inference/{deployment.id}"
        elif target == "rest_api":
            endpoint = f"http://localhost:8001/api/v1/inference/{deployment.id}"
        elif target == "vps":
            endpoint = config.get("host", "http://vps.local") + f"/inference/{deployment.id}"
        elif target == "edge":
            endpoint = f"mqtt://edge.local/models/{deployment.id}"
        elif target == "raspberry_pi":
            endpoint = f"http://pi.local:5000/inference/{deployment.id}"
        else:
            endpoint = f"http://localhost/inference/{deployment.id}"

        deployment.endpoint_url = endpoint
        deployment.status = DeploymentStatus.ACTIVE
        deployment.deployed_at = datetime.now(timezone.utc)
        session.commit()

        return {"status": "deployed", "endpoint": endpoint}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()
