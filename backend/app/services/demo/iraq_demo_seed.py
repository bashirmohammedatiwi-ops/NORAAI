"""Iraq demo seed — municipality alerts in Zayouna block 712 (Baghdad).

Street names and coordinates sourced from OpenStreetMap © contributors.
Includes default speed violations in Al-Ameen district (40 km/h limit).
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FleetDevice, Project, RoadEvent, RoadEventType
from app.models.fleet_models import DeviceTelemetry
from app.services.road.event_helpers import default_recipient

DEMO_MARKER = "rasid_iraq_demo_v1"
DEMO_NEIGHBORHOOD = "zayouna"
DEMO_NEIGHBORHOOD_AR = "الزيونة"
DEMO_BLOCK = "712"
DEMO_BLOCK_AR = "محلة 712"
OSM_ATTRIBUTION = "OpenStreetMap"
# All demo detections are attributed to vehicle #2 (Baghdad fleet)
DEMO_SOURCE_DEVICE = "rasid-bgd-02"
DEMO_SOURCE_VEHICLE_ID = "RASID-BGD-02"

AMEEN_NEIGHBORHOOD = "al_ameen"
AMEEN_NEIGHBORHOOD_AR = "حي الأمين"
AMEEN_SPEED_LIMIT_KMH = 40

# Demo fleet — all offline; Baghdad units across city districts
FLEET_VEHICLES: list[dict] = [
    {"device_id": "rasid-bgd-01", "vehicle_id": "RASID-BGD-01", "gov": "baghdad", "lat": 33.3229822, "lng": 44.4520278, "online": False, "neighborhood_ar": "الزيونة"},
    {"device_id": "rasid-bgd-02", "vehicle_id": "RASID-BGD-02", "gov": "baghdad", "lat": 33.3202289, "lng": 44.4514888, "online": False, "neighborhood_ar": "الزيونة"},
    {"device_id": "rasid-bgd-03", "vehicle_id": "RASID-BGD-03", "gov": "baghdad", "lat": 33.3176879, "lng": 44.4518373, "online": False, "neighborhood_ar": "الزيونة"},
    {"device_id": "rasid-bgd-04", "vehicle_id": "RASID-BGD-04", "gov": "baghdad", "lat": 33.3098500, "lng": 44.5185000, "online": False, "neighborhood_ar": "حي الأمين"},
    {"device_id": "rasid-bgd-05", "vehicle_id": "RASID-BGD-05", "gov": "baghdad", "lat": 33.3120000, "lng": 44.3920000, "online": False, "neighborhood_ar": "الكرادة"},
    {"device_id": "rasid-bgd-06", "vehicle_id": "RASID-BGD-06", "gov": "baghdad", "lat": 33.3128000, "lng": 44.3660000, "online": False, "neighborhood_ar": "المنصور"},
    {"device_id": "rasid-bgd-07", "vehicle_id": "RASID-BGD-07", "gov": "baghdad", "lat": 33.3230000, "lng": 44.4210000, "online": False, "neighborhood_ar": "الرصافة"},
    {"device_id": "rasid-bgd-08", "vehicle_id": "RASID-BGD-08", "gov": "baghdad", "lat": 33.3810000, "lng": 44.3840000, "online": False, "neighborhood_ar": "الأعظمية"},
    {"device_id": "rasid-bgd-09", "vehicle_id": "RASID-BGD-09", "gov": "baghdad", "lat": 33.3890000, "lng": 44.4640000, "online": False, "neighborhood_ar": "مدينة الصدر"},
    {"device_id": "rasid-bgd-10", "vehicle_id": "RASID-BGD-10", "gov": "baghdad", "lat": 33.2430000, "lng": 44.3940000, "online": False, "neighborhood_ar": "الدور"},
]

# Points sampled along OSM highway centerlines — on the road, not block centroids
STREET_ON_ROAD_POINTS: dict[str, list[tuple[float, float]]] = {
    "712-7": [(33.3202289, 44.4514888), (33.3233680, 44.4549643)],
    "712-15": [(33.3176879, 44.4518373), (33.3184457, 44.4526802)],
    "712-22": [(33.3247657, 44.4559127)],
    "712-35": [(33.3238988, 44.4566522), (33.3234588, 44.4571991)],
    "712-28": [(33.3275079, 44.4557935), (33.3269765, 44.4564807)],
    "712-18": [(33.3239226, 44.4539101), (33.3246228, 44.4530170)],
    "712-24": [(33.3244062, 44.4577300), (33.3237053, 44.4585683)],
    "712-12": [(33.3221826, 44.4511387)],
    "712-20": [(33.3251653, 44.4545456)],
    "712-2": [(33.3189750, 44.4476114)],
    "712-33": [(33.3230038, 44.4561837)],
    "712-14": [(33.3229822, 44.4520278)],
    "712-1": [(33.3206196, 44.4482519)],
    "mokdad": [(33.3219444, 44.4582116)],
}

# Al-Ameen (الأمين الثانية) — OSM-sampled road points, eastern Baghdad
AMEEN_ON_ROAD_POINTS: dict[str, list[tuple[float, float]]] = {
    "nuwwab": [(33.3087489, 44.5170126), (33.3098500, 44.5185000)],
    "araml": [(33.3092000, 44.5148000), (33.3105000, 44.5159000)],
    "park": [(33.3131894, 44.5122919)],
}

# Per-street alert scenarios — coordinates taken from STREET_ON_ROAD_POINTS
STREET_SCENARIOS: list[dict] = [
    {
        "street": "712-7",
        "street_ar": "712-7",
        "events": [
            ("pothole", "حفرة في منتصف الشارع", "high", 0.91, 0),
            ("speed_bump", "مطب أمام مدخل عمارة", "medium", 0.88, 1),
        ],
    },
    {
        "street": "712-15",
        "street_ar": "712-15",
        "events": [
            ("speed_bump", "مطب سرعة — قرب التقاطع", "medium", 0.86, 0),
            ("speed_bump", "مطب ثانٍ — أمام محل تجاري", "low", 0.82, 1),
        ],
    },
    {
        "street": "712-22",
        "street_ar": "712-22",
        "events": [
            ("pothole", "حفرة عميقة — على الشارع", "high", 0.93, 0),
        ],
    },
    {
        "street": "712-35",
        "street_ar": "712-35",
        "events": [
            ("pothole", "حفرة — بعد مطب قديم", "medium", 0.87, 0),
            ("speed_bump", "مطب — أمام جامع", "medium", 0.85, 1),
        ],
    },
    {
        "street": "712-28",
        "street_ar": "712-28",
        "events": [
            ("speed_bump", "مطب — بداية الشارع", "medium", 0.84, 0),
            ("speed_bump", "مطب — نهاية الشارع", "medium", 0.83, 1),
        ],
    },
    {
        "street": "712-18",
        "street_ar": "712-18",
        "events": [
            ("pothole", "حفرة — على الشارع", "high", 0.90, 0),
            ("speed_bump", "مطب — بعد الحفرة", "medium", 0.86, 1),
        ],
    },
    {
        "street": "712-24",
        "street_ar": "712-24",
        "events": [
            ("pothole", "حفرة — منتصف الشارع", "medium", 0.88, 0),
            ("speed_bump", "مطب — قرب مدخل فرعي", "medium", 0.84, 1),
        ],
    },
    {
        "street": "712-12",
        "street_ar": "712-12",
        "events": [
            ("pothole", "حفرة — على الشارع", "medium", 0.86, 0),
        ],
    },
    {
        "street": "712-20",
        "street_ar": "712-20",
        "events": [
            ("pothole", "حفرة — قرب تقاطع", "high", 0.92, 0),
        ],
    },
    {
        "street": "712-2",
        "street_ar": "712-2",
        "events": [
            ("pothole", "حفرة — على الشارع", "medium", 0.85, 0),
        ],
    },
    {
        "street": "712-33",
        "street_ar": "712-33",
        "events": [
            ("pothole", "حفرة — وسط الشارع", "medium", 0.89, 0),
        ],
    },
    {
        "street": "712-14",
        "street_ar": "712-14",
        "events": [
            ("pothole", "حفرة — على الشارع", "high", 0.91, 0),
        ],
    },
    {
        "street": "712-1",
        "street_ar": "712-1",
        "events": [
            ("pothole", "حفرة — قرب نهاية الشارع", "medium", 0.88, 0),
        ],
    },
    {
        "street": "mokdad",
        "street_ar": "شارع مقداد بن الأسود",
        "events": [
            ("pothole", "حفرة — شارع مقداد بن الأسود", "high", 0.90, 0),
        ],
    },
]

_EVENT_TYPE = {
    "pothole": RoadEventType.POTHOLE,
    "speed_bump": RoadEventType.SPEED_BUMP,
    "traffic_violation": RoadEventType.TRAFFIC_VIOLATION,
}


def _build_municipality_alerts() -> list[dict]:
    alerts: list[dict] = []
    idx = 0
    for scenario in STREET_SCENARIOS:
        street = scenario["street"]
        street_ar = scenario["street_ar"]
        road_points = STREET_ON_ROAD_POINTS.get(street, [])
        for event_key, detail, severity, conf, point_idx in scenario["events"]:
            idx += 1
            event_type = _EVENT_TYPE[event_key]
            if point_idx < len(road_points):
                lat, lng = road_points[point_idx]
            elif road_points:
                lat, lng = road_points[0]
            else:
                raise ValueError(f"Missing on-road points for street {street}")
            kind_ar = "حفرة" if event_key == "pothole" else "مطب سرعة"
            if street_ar.startswith("شارع"):
                title = f"{kind_ar} — {DEMO_BLOCK_AR} · {street_ar}"
            else:
                title = f"{kind_ar} — {DEMO_BLOCK_AR} {street_ar}"
            if detail and "—" in detail:
                title = f"{kind_ar} — {DEMO_BLOCK_AR} · {detail.split('—', 1)[-1].strip()}"
            alerts.append({
                "event_type": event_type,
                "lat": lat,
                "lng": lng,
                "title": title,
                "severity": severity,
                "confidence": conf,
                "device_key": DEMO_SOURCE_DEVICE,
                "hours_ago": max(1, 24 - idx),
                "street": street,
                "street_ar": street_ar,
                "reference": f"MUN-712-{idx:03d}",
            })
    return alerts


MUNICIPALITY_ALERTS = _build_municipality_alerts()


def _build_speed_violation_alerts() -> list[dict]:
    """Two default speed violations in Al-Ameen — residential 40 km/h zone."""
    scenarios = [
        {
            "street": "nuwwab",
            "street_ar": "شارع نواب الضباط",
            "reference": "TRF-AME-001",
            "speed_kmh": 58,
            "hours_ago": 3,
            "point_idx": 0,
            "detail": "قرب تقاطع الزهور",
        },
        {
            "street": "araml",
            "street_ar": "شارع الأرامل",
            "reference": "TRF-AME-002",
            "speed_kmh": 52,
            "hours_ago": 5,
            "point_idx": 0,
            "detail": "أمام مدخل حي الأمين",
        },
    ]
    alerts: list[dict] = []
    for spec in scenarios:
        road_points = AMEEN_ON_ROAD_POINTS.get(spec["street"], [])
        if not road_points:
            raise ValueError(f"Missing on-road points for Al-Ameen street {spec['street']}")
        idx = spec["point_idx"]
        lat, lng = road_points[idx if idx < len(road_points) else 0]
        speed = spec["speed_kmh"]
        limit = AMEEN_SPEED_LIMIT_KMH
        excess = speed - limit
        title = f"تجاوز سرعة — {AMEEN_NEIGHBORHOOD_AR} · {speed} كم/س (حد {limit})"
        alerts.append({
            "event_type": RoadEventType.TRAFFIC_VIOLATION,
            "lat": lat,
            "lng": lng,
            "title": title,
            "severity": "high" if excess >= 15 else "medium",
            "confidence": None,
            "device_key": DEMO_SOURCE_DEVICE,
            "hours_ago": spec["hours_ago"],
            "street": spec["street"],
            "street_ar": spec["street_ar"],
            "reference": spec["reference"],
            "neighborhood": AMEEN_NEIGHBORHOOD,
            "neighborhood_ar": AMEEN_NEIGHBORHOOD_AR,
            "speed_kmh": speed,
            "speed_limit_kmh": limit,
            "speed": speed,
            "speed_limit": limit,
            "excess_kmh": excess,
            "detail": spec["detail"],
        })
    return alerts


SPEED_VIOLATION_ALERTS = _build_speed_violation_alerts()
ALL_DEMO_ALERTS = MUNICIPALITY_ALERTS + SPEED_VIOLATION_ALERTS


def _resolve_source_device(device_by_key: dict[str, FleetDevice]) -> FleetDevice | None:
    return device_by_key.get(DEMO_SOURCE_DEVICE)


def _apply_source_vehicle_meta(meta: dict, device: FleetDevice | None) -> dict:
    meta = dict(meta)
    meta["vehicle_id"] = device.vehicle_id if device else DEMO_SOURCE_VEHICLE_ID
    meta["device_code"] = DEMO_SOURCE_DEVICE
    meta["source_vehicle"] = DEMO_SOURCE_VEHICLE_ID
    return meta


def _demo_event_meta(spec: dict, device: FleetDevice | None) -> dict:
    device = device or None
    meta: dict = {
        "recipient": default_recipient(spec["event_type"]),
        "severity": spec["severity"],
        "municipality_id": "baghdad",
        "street": spec["street"],
        "street_ar": spec["street_ar"],
        "location_source": OSM_ATTRIBUTION,
        "title": spec["title"],
        "reference": spec["reference"],
        "demo_batch": DEMO_MARKER,
    }
    if spec.get("neighborhood"):
        meta["neighborhood"] = spec["neighborhood"]
        meta["neighborhood_ar"] = spec.get("neighborhood_ar")
    else:
        meta["neighborhood"] = DEMO_NEIGHBORHOOD
        meta["neighborhood_ar"] = DEMO_NEIGHBORHOOD_AR
        meta["block"] = DEMO_BLOCK
        meta["block_ar"] = DEMO_BLOCK_AR
    if spec["event_type"] == RoadEventType.TRAFFIC_VIOLATION:
        meta["speed_kmh"] = spec["speed_kmh"]
        meta["speed_limit_kmh"] = spec["speed_limit_kmh"]
        meta["speed"] = spec["speed"]
        meta["speed_limit"] = spec["speed_limit"]
        meta["excess_kmh"] = spec["excess_kmh"]
        meta["violation_type"] = "speed"
        if spec.get("detail"):
            meta["detail_ar"] = spec["detail"]
    return _apply_source_vehicle_meta(meta, device)


def _add_demo_event(
    db: AsyncSession,
    project_id: uuid.UUID,
    spec: dict,
    device_by_key: dict[str, FleetDevice],
    *,
    now: datetime,
    seq: int,
) -> RoadEvent:
    device = _resolve_source_device(device_by_key)
    created_at = now - timedelta(hours=spec["hours_ago"], minutes=seq * 3)
    confidence = None if spec["event_type"] == RoadEventType.TRAFFIC_VIOLATION else spec["confidence"]
    event = RoadEvent(
        project_id=project_id,
        device_id=device.id if device else None,
        event_type=spec["event_type"],
        latitude=spec["lat"],
        longitude=spec["lng"],
        confidence=confidence,
        is_active=True,
        extra_metadata=_demo_event_meta(spec, device),
        created_at=created_at,
    )
    db.add(event)
    return event


async def _existing_demo_references(db: AsyncSession, project_id: uuid.UUID) -> set[str]:
    result = await db.execute(select(RoadEvent).where(RoadEvent.project_id == project_id))
    refs: set[str] = set()
    for event in result.scalars().all():
        meta = event.extra_metadata or {}
        if meta.get("demo_batch") != DEMO_MARKER:
            continue
        ref = meta.get("reference")
        if isinstance(ref, str) and ref.strip():
            refs.add(ref.strip().upper())
    return refs


async def sync_demo_missing_alerts(
    db: AsyncSession,
    project_id: uuid.UUID,
    device_by_key: dict[str, FleetDevice],
    *,
    now: datetime | None = None,
) -> int:
    """Insert demo alerts that are missing (e.g. new speed violations after an upgrade)."""
    now = now or datetime.now(timezone.utc)
    existing = await _existing_demo_references(db, project_id)
    added = 0
    for seq, spec in enumerate(ALL_DEMO_ALERTS, start=1):
        ref = str(spec["reference"]).upper()
        if ref in existing:
            continue
        _add_demo_event(db, project_id, spec, device_by_key, now=now, seq=seq + 100)
        added += 1
    if added:
        await db.flush()
    return added


async def demo_already_seeded(db: AsyncSession, project_id: uuid.UUID) -> bool:
    check = await db.execute(
        select(RoadEvent).where(RoadEvent.project_id == project_id).limit(200)
    )
    for ev in check.scalars().all():
        if (ev.extra_metadata or {}).get("demo_batch") == DEMO_MARKER:
            return True
    return False


async def clear_demo_alerts(db: AsyncSession, project_id: uuid.UUID) -> int:
    result = await db.execute(select(RoadEvent).where(RoadEvent.project_id == project_id))
    removed = 0
    for event in result.scalars().all():
        if (event.extra_metadata or {}).get("demo_batch") == DEMO_MARKER:
            await db.delete(event)
            removed += 1
    if removed:
        await db.flush()
    return removed


async def _purge_stale_demo_fleet(
    db: AsyncSession,
    project_id: uuid.UUID,
    device_by_key: dict[str, FleetDevice],
) -> int:
    """Remove legacy demo fleet units (e.g. other governorates) after roster changes."""
    allowed = {spec["device_id"] for spec in FLEET_VEHICLES}
    source = device_by_key.get(DEMO_SOURCE_DEVICE)
    result = await db.execute(select(FleetDevice).where(FleetDevice.project_id == project_id))
    removed = 0
    for device in result.scalars().all():
        meta = device.extra_metadata or {}
        if meta.get("demo_batch") != DEMO_MARKER or device.device_id in allowed:
            continue
        if source:
            events = await db.execute(
                select(RoadEvent).where(
                    RoadEvent.project_id == project_id,
                    RoadEvent.device_id == device.id,
                )
            )
            for event in events.scalars().all():
                event.device_id = source.id
        telemetry = await db.execute(select(DeviceTelemetry).where(DeviceTelemetry.device_id == device.id))
        for row in telemetry.scalars().all():
            await db.delete(row)
        await db.delete(device)
        removed += 1
    if removed:
        await db.flush()
    return removed


async def sync_demo_fleet(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> dict[str, FleetDevice]:
    now = now or datetime.now(timezone.utc)
    device_by_key: dict[str, FleetDevice] = {}

    for spec in FLEET_VEHICLES:
        existing = await db.execute(
            select(FleetDevice).where(FleetDevice.device_id == spec["device_id"])
        )
        device = existing.scalar_one_or_none()
        meta = {"governorate": spec["gov"], "demo_batch": DEMO_MARKER}
        if spec["device_id"] == DEMO_SOURCE_DEVICE:
            meta["demo_source_vehicle"] = True
        if spec["device_id"] == DEMO_SOURCE_DEVICE:
            meta["neighborhood"] = DEMO_NEIGHBORHOOD
            meta["neighborhood_ar"] = DEMO_NEIGHBORHOOD_AR
            meta["block"] = DEMO_BLOCK
            meta["block_ar"] = DEMO_BLOCK_AR
        elif spec.get("neighborhood_ar"):
            meta["neighborhood_ar"] = spec["neighborhood_ar"]
        if not device:
            device = FleetDevice(
                project_id=project_id,
                device_id=spec["device_id"],
                vehicle_id=spec["vehicle_id"],
                api_key=secrets.token_urlsafe(24),
                gps_status="fix" if spec["online"] else "lost",
                camera_status="ok",
                is_online=spec["online"],
                latitude=spec["lat"],
                longitude=spec["lng"],
                last_communication=now - timedelta(minutes=2 if spec["online"] else 120),
                extra_metadata=meta,
            )
            db.add(device)
            await db.flush()
        else:
            device.vehicle_id = spec["vehicle_id"]
            device.is_online = spec["online"]
            device.latitude = spec["lat"]
            device.longitude = spec["lng"]
            device.gps_status = "fix" if spec["online"] else "lost"
            device.last_communication = now - timedelta(minutes=2 if spec["online"] else 120)
            device.extra_metadata = {**(device.extra_metadata or {}), **meta}
        device_by_key[spec["device_id"]] = device

    await _purge_stale_demo_fleet(db, project_id, device_by_key)
    await db.flush()
    return device_by_key


async def sync_demo_alert_vehicle(
    db: AsyncSession,
    project_id: uuid.UUID,
    device_by_key: dict[str, FleetDevice],
) -> int:
    """Point every demo alert at RASID-BGD-02 (all 20 municipality + extras)."""
    device = _resolve_source_device(device_by_key)
    if not device:
        return 0

    result = await db.execute(select(RoadEvent).where(RoadEvent.project_id == project_id))
    updated = 0
    for event in result.scalars().all():
        meta = dict(event.extra_metadata or {})
        if meta.get("demo_batch") != DEMO_MARKER:
            continue
        meta = _apply_source_vehicle_meta(meta, device)
        event.device_id = device.id
        event.extra_metadata = meta
        if event.event_type == RoadEventType.TRAFFIC_VIOLATION:
            event.confidence = None
        updated += 1

    if updated:
        await db.flush()
    return updated


async def _try_attach_demo_images(db: AsyncSession, project_id: uuid.UUID) -> dict:
    from app.core.config import get_settings, resolve_data_path
    from app.services.demo.attach_demo_images import attach_demo_images

    settings = get_settings()
    return await attach_demo_images(
        db,
        project_id,
        source_dir=resolve_data_path(settings.demo_images_dir),
        upload_dir=resolve_data_path(settings.evidence_upload_dir),
    )


async def seed_iraq_demo(db: AsyncSession, project_id: uuid.UUID, *, force: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    device_by_key = await sync_demo_fleet(db, project_id, now=now)

    if not force and await demo_already_seeded(db, project_id):
        reassigned = await sync_demo_alert_vehicle(db, project_id, device_by_key)
        added = await sync_demo_missing_alerts(db, project_id, device_by_key, now=now)
        attach = await _try_attach_demo_images(db, project_id)
        return {
            "seeded": False,
            "reason": "already_seeded",
            "vehicles": len(FLEET_VEHICLES),
            "vehicles_online": sum(1 for s in FLEET_VEHICLES if s["online"]),
            "alerts_reassigned": reassigned,
            "alerts_added": added,
            "source_vehicle": DEMO_SOURCE_VEHICLE_ID,
            "images_attached": attach.get("attached", 0),
            "images_source": attach.get("source"),
        }

    cleared = 0
    if force:
        cleared = await clear_demo_alerts(db, project_id)

    alerts_created = 0
    for seq, spec in enumerate(ALL_DEMO_ALERTS, start=1):
        _add_demo_event(db, project_id, spec, device_by_key, now=now, seq=seq)
        alerts_created += 1

    await db.flush()
    await sync_demo_alert_vehicle(db, project_id, device_by_key)
    attach = await _try_attach_demo_images(db, project_id)
    return {
        "seeded": True,
        "vehicles": len(FLEET_VEHICLES),
        "vehicles_online": sum(1 for s in FLEET_VEHICLES if s["online"]),
        "alerts": alerts_created,
        "municipality_alerts": len(MUNICIPALITY_ALERTS),
        "speed_violations": len(SPEED_VIOLATION_ALERTS),
        "cleared": cleared,
        "marker": DEMO_MARKER,
        "neighborhood": DEMO_NEIGHBORHOOD_AR,
        "block": DEMO_BLOCK_AR,
        "source_vehicle": DEMO_SOURCE_VEHICLE_ID,
        "images_attached": attach.get("attached", 0),
        "images_source": attach.get("source"),
    }


async def seed_iraq_demo_for_default_project(db: AsyncSession) -> dict | None:
    result = await db.execute(select(Project).where(Project.name == "Road Infrastructure Monitoring"))
    project = result.scalar_one_or_none()
    if not project:
        return None
    return await seed_iraq_demo(db, project.id)
