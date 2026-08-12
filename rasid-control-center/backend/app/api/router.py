from fastapi import APIRouter

from app.api import auth, control_center, fleet, models_api, projects, road_intelligence

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(fleet.router)
api_router.include_router(road_intelligence.router)
api_router.include_router(control_center.router)
api_router.include_router(models_api.router)
