from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.minio_client import ensure_bucket

settings = get_settings()

REQUEST_COUNT = Counter("aiops_requests_total", "Total requests", ["method", "endpoint"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tables are created by scripts/init_db.py in entrypoint before uvicorn starts.
    try:
        ensure_bucket()
    except Exception:
        pass
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/dashboard/stats")
async def dashboard_stats():
    from sqlalchemy import func, select
    from app.core.database import async_session
    from app.models import Deployment, DeploymentStatus, DriftAlert, FleetDevice, Image, Project, TrainingJob, TrainingStatus

    async with async_session() as db:
        projects = await db.execute(select(func.count(Project.id)))
        training = await db.execute(
            select(func.count(TrainingJob.id)).where(TrainingJob.status == TrainingStatus.RUNNING)
        )
        deployed = await db.execute(
            select(func.count(Deployment.id)).where(Deployment.status == DeploymentStatus.ACTIVE)
        )
        fleet = await db.execute(
            select(func.count(FleetDevice.id)).where(FleetDevice.is_online == True)
        )
        images = await db.execute(select(func.count(Image.id)))
        alerts = await db.execute(
            select(func.count(DriftAlert.id)).where(DriftAlert.is_acknowledged == False)
        )

    return {
        "total_projects": projects.scalar() or 0,
        "active_training_jobs": training.scalar() or 0,
        "deployed_models": deployed.scalar() or 0,
        "fleet_devices_online": fleet.scalar() or 0,
        "images_ingested": images.scalar() or 0,
        "alerts_active": alerts.scalar() or 0,
    }
