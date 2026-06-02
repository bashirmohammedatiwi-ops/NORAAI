"""Suppress duplicate road events from periodic camera frames."""

from __future__ import annotations

import math
import uuid

from app.core.config import get_settings
from app.core.redis_client import get_redis


def _cell_key(latitude: float, longitude: float, radius_m: float) -> str:
    """Grid cell ~radius_m for deduplication."""
    meters_per_deg_lat = 111_320.0
    lat_step = max(radius_m / meters_per_deg_lat, 0.0001)
    cos_lat = max(math.cos(math.radians(latitude)), 0.2)
    lon_step = max(radius_m / (meters_per_deg_lat * cos_lat), 0.0001)
    lat_cell = int(round(latitude / lat_step))
    lon_cell = int(round(longitude / lon_step))
    return f"{lat_cell}:{lon_cell}"


async def should_create_event(
    project_id: uuid.UUID,
    event_type: str,
    latitude: float,
    longitude: float,
    *,
    device_id: uuid.UUID | None = None,
) -> bool:
    """
    Return False if the same event type was recently reported in this area.
    Uses Redis when available; otherwise allows the event.
    """
    settings = get_settings()
    cooldown = max(5, settings.event_dedup_cooldown_seconds)
    radius_m = max(20.0, settings.event_dedup_radius_meters)
    cell = _cell_key(latitude, longitude, radius_m)
    device_part = str(device_id) if device_id else "any"
    redis_key = f"road:dedup:{project_id}:{event_type}:{device_part}:{cell}"

    try:
        redis = await get_redis()
        created = await redis.set(redis_key, "1", nx=True, ex=cooldown)
        return bool(created)
    except Exception:
        return True


async def filter_detections_for_events(
    project_id: uuid.UUID,
    latitude: float,
    longitude: float,
    detections: list[dict],
    *,
    device_id: uuid.UUID | None = None,
    min_confidence: float = 0.5,
) -> list[dict]:
    """Keep only detections that pass deduplication."""
    kept: list[dict] = []
    for det in detections:
        if det.get("confidence", 0) < min_confidence:
            continue
        event_type = det.get("event_type")
        if not event_type:
            continue
        if await should_create_event(
            project_id,
            str(event_type),
            latitude,
            longitude,
            device_id=device_id,
        ):
            kept.append(det)
    return kept
