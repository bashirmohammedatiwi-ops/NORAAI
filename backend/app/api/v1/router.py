from fastapi import APIRouter

from app.api.v1 import annotation, auth, datasets, deployment, driver, inference, ingestion, projects, reports, road_intelligence, training
from app.websockets import training_metrics

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(ingestion.router)
api_router.include_router(driver.router)
api_router.include_router(datasets.router)
api_router.include_router(annotation.router)
api_router.include_router(training.router)
api_router.include_router(inference.router)
api_router.include_router(deployment.router)
api_router.include_router(road_intelligence.router)
api_router.include_router(reports.router)
api_router.include_router(training_metrics.router)
