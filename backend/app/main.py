from contextlib import asynccontextmanager
import asyncio

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import FileResponse, Response

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

_static_dir = (settings.static_frontend_dir or "").strip()
if _static_dir and Path(_static_dir).is_dir():
    _assets = Path(_static_dir) / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/")
    async def spa_index():
        index = Path(_static_dir) / "index.html"
        if index.is_file():
            return FileResponse(index)
        return {"status": "ok", "service": settings.app_name}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}


@app.get("/health/ready")
async def health_ready():
    """Deep check used by VPS watchdog (DB must respond)."""
    from fastapi import HTTPException
    from sqlalchemy import text

    from app.core.database import engine

    try:
        async with asyncio.timeout(5):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": settings.app_name, "database": "ok"}
    except TimeoutError as exc:
        raise HTTPException(status_code=503, detail="not ready: database timeout") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"not ready: {exc}") from exc


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

