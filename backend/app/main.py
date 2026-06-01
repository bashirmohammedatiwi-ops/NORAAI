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


@app.get("/health/ready")
async def health_ready():
    """Deep check used by VPS watchdog (DB must respond)."""
    from fastapi import HTTPException
    from sqlalchemy import text

    from app.core.database import engine

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": settings.app_name, "database": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"not ready: {exc}") from exc


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

