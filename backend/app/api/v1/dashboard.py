from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas import DashboardHomeResponse
from app.services.dashboard.service import fetch_dashboard_home, fetch_dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await fetch_dashboard_stats(db, user.organization_id)


@router.get("/home", response_model=DashboardHomeResponse)
async def dashboard_home(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await fetch_dashboard_home(db, user.organization_id)
