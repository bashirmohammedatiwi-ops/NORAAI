"""Fast Ultralytics lab predict client — pooled HTTP, image prep, warmup."""

from __future__ import annotations

import asyncio
import io
import time
from typing import Any

import httpx
from PIL import Image, ImageOps

from app.core.config import get_settings

_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()
_warmup_done = False

MAX_UPLOAD_BYTES = 80 * 1024 * 1024
JPEG_QUALITY = 82
MAX_LONG_EDGE_CAP = 1280


async def get_predict_client() -> httpx.AsyncClient:
    global _client
    if _client is not None and not _client.is_closed:
        return _client
    async with _client_lock:
        if _client is None or _client.is_closed:
            _client = httpx.AsyncClient(
                timeout=httpx.Timeout(180.0, connect=8.0),
                limits=httpx.Limits(max_connections=24, max_keepalive_connections=12),
            )
    return _client


async def close_predict_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def resolve_predict_url(raw_url: str) -> str:
    url = raw_url.strip().rstrip("/")
    if not url:
        return ""
    if url.endswith("/predict"):
        return url
    return f"{url}/predict"


def resolve_api_key(form_key: str | None) -> str:
    settings = get_settings()
    return (form_key or "").strip() or settings.cloud_predict_api_key.strip()


def optimize_image_bytes(content: bytes, content_type: str, imgsz: int) -> tuple[bytes, str, str]:
    """Resize/compress images before cloud inference — keeps aspect ratio."""
    if not content_type.startswith("image/"):
        return content, content_type, "upload.bin"

    max_edge = min(MAX_LONG_EDGE_CAP, max(320, int(imgsz * 1.25)))
    try:
        with Image.open(io.BytesIO(content)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            w, h = img.size
            long_edge = max(w, h)
            if long_edge > max_edge:
                scale = max_edge / long_edge
                img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.BILINEAR)
            elif len(content) < 180_000 and long_edge <= max_edge:
                return content, content_type, "upload.jpg"

            out = io.BytesIO()
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            return out.getvalue(), "image/jpeg", "lab.jpg"
    except Exception:
        return content, content_type, "upload.jpg"


def parse_upstream_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict):
            msg = body.get("message") or body.get("error") or body.get("detail")
            if msg:
                return str(msg)
    except ValueError:
        pass
    return response.text[:300] or response.reason_phrase


def extract_upstream_inference_ms(payload: dict[str, Any]) -> float | None:
    images = payload.get("images")
    if not isinstance(images, list) or not images:
        return None
    first = images[0]
    if not isinstance(first, dict):
        return None
    speed = first.get("speed")
    if isinstance(speed, dict) and speed.get("inference") is not None:
        return round(float(speed["inference"]), 1)
    return None


async def warmup_predict_service() -> bool:
    """Hit deployment root once to reduce cold-start latency."""
    global _warmup_done
    if _warmup_done:
        return True
    settings = get_settings()
    base = settings.cloud_predict_url.strip().rstrip("/").removesuffix("/predict")
    if not base:
        return False
    try:
        client = await get_predict_client()
        await client.get(f"{base}/", timeout=8.0)
        _warmup_done = True
        return True
    except Exception:
        return False


class LabPredictError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


async def call_predict(
    *,
    url: str,
    api_key: str,
    content: bytes,
    filename: str,
    content_type: str,
    conf: float,
    iou: float,
    imgsz: int,
) -> tuple[dict[str, Any], float, float | None]:
    """Returns (payload, total_latency_ms, upstream_inference_ms)."""
    prepared, send_type, send_name = optimize_image_bytes(content, content_type, imgsz)
    started = time.perf_counter()
    client = await get_predict_client()
    response = await client.post(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        data={"conf": str(conf), "iou": str(iou), "imgsz": str(imgsz)},
        files={"file": (send_name or filename, prepared, send_type)},
    )
    total_ms = round((time.perf_counter() - started) * 1000, 1)
    if response.status_code >= 400:
        raise LabPredictError(response.status_code, parse_upstream_error(response))
    payload = response.json()
    upstream_ms = extract_upstream_inference_ms(payload) if isinstance(payload, dict) else None
    return payload, total_ms, upstream_ms


async def call_predict_many(
    *,
    url: str,
    api_key: str,
    items: list[tuple[bytes, str, str]],
    conf: float,
    iou: float,
    imgsz: int,
    concurrency: int = 4,
) -> list[tuple[dict[str, Any], float, float | None]]:
    sem = asyncio.Semaphore(max(1, min(concurrency, 8)))

    async def one(item: tuple[bytes, str, str]) -> tuple[dict[str, Any], float, float | None]:
        content, content_type, filename = item
        async with sem:
            return await call_predict(
                url=url,
                api_key=api_key,
                content=content,
                filename=filename,
                content_type=content_type,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
            )

    return await asyncio.gather(*(one(item) for item in items))
