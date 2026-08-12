import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.db_migrate import ensure_road_event_enum
from app.services.lab.predict_client import close_predict_client
from sqlalchemy import text

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    for sub in ("uploads/evidence", "uploads/models", "demo_images"):
        Path(sub).mkdir(parents=True, exist_ok=True)
    try:
        await ensure_road_event_enum()
    except Exception:
        pass
    yield
    await close_predict_client()


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

_uploads = Path("uploads")
_uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads)), name="uploads")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}


@app.get("/health/ready")
async def health_ready():
    try:
        async with asyncio.timeout(5):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": settings.app_name}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "detail": str(exc)})
