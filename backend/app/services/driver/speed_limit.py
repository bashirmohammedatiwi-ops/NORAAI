"""Road speed limits from OpenStreetMap (+ optional Google Roads API)."""

from __future__ import annotations

import json
import logging
import math
import re

import httpx

from app.core.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

GOOGLE_SPEED_LIMITS_URL = "https://roads.googleapis.com/v1/speedLimits"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
CACHE_TTL_SECONDS = 180

# Typical limits (km/h) when OSM has highway type but no maxspeed tag
HIGHWAY_DEFAULTS: dict[str, float] = {
    "motorway": 120,
    "motorway_link": 80,
    "trunk": 100,
    "trunk_link": 60,
    "primary": 80,
    "primary_link": 60,
    "secondary": 60,
    "secondary_link": 40,
    "tertiary": 50,
    "tertiary_link": 40,
    "unclassified": 50,
    "residential": 30,
    "living_street": 20,
    "service": 20,
    "road": 50,
}


def _to_kmh(speed: float, units: str) -> float:
    if units.upper() == "MPH":
        return round(speed * 1.60934)
    return round(speed)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6378137.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _parse_maxspeed(raw: str) -> float | None:
    if not raw:
        return None
    v = raw.strip().lower().replace(" ", "")

    m = re.match(r"^(\d+(?:\.\d+)?)(km/h|kmh|kph)?$", v)
    if m:
        return float(m.group(1))

    m = re.match(r"^(\d+(?:\.\d+)?)mph$", v)
    if m:
        return round(float(m.group(1)) * 1.60934)

    if "walk" in v or "foot" in v:
        return 5
    if "urban" in v:
        return 50
    if "rural" in v:
        return 90
    if "motorway" in v or "nsl" in v:
        return 120

    return None


def _road_label(tags: dict) -> str | None:
    for key in ("name:ar", "name", "ref"):
        val = tags.get(key)
        if val:
            return str(val)
    highway = tags.get("highway")
    return str(highway) if highway else None


def _pick_osm_way(elements: list[dict], lat: float, lon: float) -> dict | None:
    best: dict | None = None
    best_dist = float("inf")
    for el in elements:
        if el.get("type") != "way":
            continue
        center = el.get("center") or {}
        clat = center.get("lat")
        clon = center.get("lon")
        if clat is None or clon is None:
            continue
        dist = _haversine_m(lat, lon, clat, clon)
        if dist < best_dist:
            best_dist = dist
            best = el
    return best


async def _fetch_osm_speed_limit(lat: float, lon: float) -> dict | None:
    query = (
        f'[out:json][timeout:15];('
        f'way(around:55,{lat},{lon})["maxspeed"]["highway"];'
        f'way(around:55,{lat},{lon})["highway"];'
        f');out tags center qt;'
    )
    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
    except Exception as exc:
        logger.warning("Overpass request failed: %s", exc)
        return None

    if resp.status_code != 200:
        logger.warning("Overpass HTTP %s: %s", resp.status_code, resp.text[:200])
        return None

    elements = resp.json().get("elements") or []
    if not elements:
        return None

    # Prefer ways that have explicit maxspeed
    tagged = [e for e in elements if e.get("tags", {}).get("maxspeed")]
    way = _pick_osm_way(tagged, lat, lon) or _pick_osm_way(elements, lat, lon)
    if not way:
        return None

    tags = way.get("tags") or {}
    highway = tags.get("highway", "")
    road_name = _road_label(tags)

    maxspeed_raw = tags.get("maxspeed")
    if maxspeed_raw:
        parsed = _parse_maxspeed(str(maxspeed_raw))
        if parsed:
            return {
                "speed_limit_kmh": parsed,
                "source": "osm",
                "road_name": road_name,
                "highway_type": highway or None,
            }

    inferred = HIGHWAY_DEFAULTS.get(str(highway))
    if inferred:
        return {
            "speed_limit_kmh": inferred,
            "source": "osm_inferred",
            "road_name": road_name,
            "highway_type": highway,
        }

    return None


async def _fetch_google_speed_limit(lat: float, lon: float, api_key: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                GOOGLE_SPEED_LIMITS_URL,
                params={"path": f"{lat},{lon}", "key": api_key},
            )
    except Exception as exc:
        logger.warning("Google speedLimits failed: %s", exc)
        return None

    if resp.status_code != 200:
        logger.warning("Google speedLimits HTTP %s: %s", resp.status_code, resp.text[:240])
        return None

    limits = resp.json().get("speedLimits") or []
    if not limits:
        return None

    best = limits[0]
    raw = best.get("speedLimit")
    if raw is None:
        return None

    return {
        "speed_limit_kmh": _to_kmh(float(raw), best.get("units", "KPH")),
        "source": "google",
        "place_id": best.get("placeId"),
        "road_name": None,
        "highway_type": None,
    }


def _payload(result: dict) -> dict:
    return {
        "speed_limit_kmh": result["speed_limit_kmh"],
        "source": result["source"],
        "road_speed_available": True,
        "place_id": result.get("place_id"),
        "road_name": result.get("road_name"),
        "highway_type": result.get("highway_type"),
    }


async def get_road_speed_limit(lat: float, lon: float, fallback_kmh: float = 80) -> dict:
    cache_key = f"roads:speed:{round(lat, 4)}:{round(lon, 4)}"
    try:
        redis = await get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        redis = None

    api_key = (get_settings().google_maps_api_key or "").strip()

    # 1) Google when key is configured (best where available)
    if api_key:
        google = await _fetch_google_speed_limit(lat, lon, api_key)
        if google:
            payload = _payload(google)
            if redis:
                try:
                    await redis.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(payload))
                except Exception:
                    pass
            return payload

    # 2) OpenStreetMap — works without API key, good coverage in Iraq
    osm = await _fetch_osm_speed_limit(lat, lon)
    if osm:
        payload = _payload(osm)
        if redis:
            try:
                await redis.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(payload))
            except Exception:
                pass
        return payload

    payload = {
        "speed_limit_kmh": fallback_kmh,
        "source": "fallback",
        "road_speed_available": True,
        "place_id": None,
        "road_name": None,
        "highway_type": None,
    }
    if redis:
        try:
            await redis.setex(cache_key, 60, json.dumps(payload))
        except Exception:
            pass
    return payload
