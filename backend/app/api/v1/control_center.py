"""Control center API — overview stats and notifications for Rasid Control Center."""

import json
import time
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings, resolve_data_path
from app.core.database import get_db
from app.models import FleetDevice, RoadEvent, RoadEventType, User
from app.services.lab.predict_client import (
    LabPredictError,
    call_predict,
    call_predict_many,
    resolve_api_key,
    resolve_predict_url,
    warmup_predict_service,
)
from app.services.road.event_helpers import default_recipient, serialize_road_event

router = APIRouter(prefix="/control-center", tags=["control-center"])

LAB_DEFAULTS = {"conf": 0.25, "iou": 0.7, "imgsz": 416}
LAB_FAST_DEFAULTS = {"conf": 0.25, "iou": 0.45, "imgsz": 320}
LAB_ENDPOINT_LABEL = "exp-3-turin · Ultralytics"
LAB_BATCH_CONCURRENCY = 4


@router.get("/{project_id}/overview")
async def control_center_overview(project_id: UUID, db: AsyncSession = Depends(get_db)):
    active_events = await db.execute(
        select(RoadEvent).where(RoadEvent.project_id == project_id, RoadEvent.is_active == True).limit(500)
    )
    events = list(active_events.scalars().all())

    online = await db.execute(
        select(func.count(FleetDevice.id)).where(
            FleetDevice.project_id == project_id,
            FleetDevice.is_online == True,
        )
    )
    total_devices = await db.execute(
        select(func.count(FleetDevice.id)).where(FleetDevice.project_id == project_id)
    )
    resolved_today = await db.execute(
        select(func.count(RoadEvent.id)).where(
            RoadEvent.project_id == project_id,
            RoadEvent.is_active == False,
        )
    )

    by_recipient: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_municipality: dict[str, int] = {}

    for event in events:
        serialized = serialize_road_event(event)
        recipient = serialized["recipient"]
        by_recipient[recipient] = by_recipient.get(recipient, 0) + 1
        by_type[event.event_type.value] = by_type.get(event.event_type.value, 0) + 1
        sev = serialized["severity"]
        by_severity[sev] = by_severity.get(sev, 0) + 1
        muni = serialized.get("municipality_id") or "unknown"
        by_municipality[muni] = by_municipality.get(muni, 0) + 1

    critical = sum(1 for e in events if e.event_type == RoadEventType.ACCIDENT)
    recent = sorted(events, key=lambda e: e.created_at, reverse=True)[:8]

    return {
        "active_alerts": len(events),
        "critical_alerts": critical,
        "vehicles_online": online.scalar() or 0,
        "vehicles_total": total_devices.scalar() or 0,
        "resolved_total": resolved_today.scalar() or 0,
        "by_recipient": by_recipient,
        "by_type": by_type,
        "by_severity": by_severity,
        "by_municipality": by_municipality,
        "recent_alerts": [serialize_road_event(e) for e in recent],
    }


@router.get("/{project_id}/notifications")
async def control_center_notifications(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RoadEvent)
        .where(RoadEvent.project_id == project_id)
        .order_by(RoadEvent.created_at.desc())
        .limit(100)
    )
    notifications = []
    for event in result.scalars().all():
        serialized = serialize_road_event(event)
        notifications.append({
            **serialized,
            "read": not event.is_active,
            "message": _notification_message(event),
        })
    return notifications


@router.get("/lab/config")
async def lab_config(user: User = Depends(get_current_user)):
    del user
    settings = get_settings()
    endpoint = resolve_predict_url(settings.cloud_predict_url)
    configured = bool(endpoint)
    env_key = settings.cloud_predict_api_key.strip()
    await warmup_predict_service()
    return {
        "configured": configured,
        "endpoint": endpoint if configured else None,
        "endpoint_label": LAB_ENDPOINT_LABEL,
        "api_key_required": True,
        "api_key_configured": bool(env_key),
        "defaults": LAB_DEFAULTS,
        "fast_defaults": LAB_FAST_DEFAULTS,
        "supports_video": True,
        "max_upload_mb": 80,
        "batch_concurrency": LAB_BATCH_CONCURRENCY,
    }


@router.post("/lab/warmup")
async def lab_warmup(user: User = Depends(get_current_user)):
    del user
    ok = await warmup_predict_service()
    return {"warmed": ok}


def _build_predict_response(
    *,
    payload: dict,
    latency_ms: float,
    inference_ms: float | None,
    conf: float,
    iou: float,
    imgsz: int,
    filename: str,
    content_type: str,
    size_bytes: int,
    include_raw: bool,
) -> dict:
    detections = _normalize_detections(payload)
    images = payload.get("images") if isinstance(payload.get("images"), list) else []
    speed = images[0].get("speed") if images and isinstance(images[0], dict) else None
    body = {
        "latency_ms": latency_ms,
        "inference_ms": inference_ms,
        "params": {"conf": conf, "iou": iou, "imgsz": imgsz},
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size_bytes,
        "count": len(detections),
        "detections": detections,
        "annotated_image": _extract_annotated_image(payload),
    }
    body["raw"] = payload if include_raw else {"metadata": payload.get("metadata"), "speed": speed}
    return body


def _lab_auth_and_url(api_key: str | None) -> tuple[str, str]:
    settings = get_settings()
    url = resolve_predict_url(settings.cloud_predict_url)
    resolved_key = resolve_api_key(api_key)
    if not url:
        raise HTTPException(status_code=503, detail="لم يُضبط CLOUD_PREDICT_URL في backend/.env")
    if not resolved_key:
        raise HTTPException(
            status_code=401,
            detail="مطلوب مفتاح Ultralytics API (ul_xxx) — أدخله في المختبر أو CLOUD_PREDICT_API_KEY في backend/.env",
        )
    return url, resolved_key


@router.post("/{project_id}/lab/predict")
async def lab_predict(
    project_id: UUID,
    file: UploadFile = File(...),
    conf: float = Form(LAB_DEFAULTS["conf"]),
    iou: float = Form(LAB_DEFAULTS["iou"]),
    imgsz: int = Form(LAB_DEFAULTS["imgsz"]),
    api_key: str | None = Form(None),
    include_raw: bool = Form(False),
    user: User = Depends(get_current_user),
):
    del project_id, user
    url, resolved_key = _lab_auth_and_url(api_key)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="الملف فارغ")
    if len(content) > 80 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="الحد الأقصى 80MB")

    filename = file.filename or "upload.jpg"
    content_type = file.content_type or "application/octet-stream"

    try:
        payload, latency_ms, inference_ms = await call_predict(
            url=url,
            api_key=resolved_key,
            content=content,
            filename=filename,
            content_type=content_type,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="انتهت مهلة API — جرّب ملفاً أصغر") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"تعذّر الاتصال بـ API: {exc}") from exc
    except LabPredictError as exc:
        if exc.status_code == 401:
            raise HTTPException(status_code=401, detail=f"مفتاح API غير صالح: {exc.message}") from exc
        raise HTTPException(status_code=exc.status_code, detail=f"خطأ من API: {exc.message}") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="استجابة API غير صالحة")

    return _build_predict_response(
        payload=payload,
        latency_ms=latency_ms,
        inference_ms=inference_ms,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        include_raw=include_raw,
    )


@router.post("/{project_id}/lab/predict-batch")
async def lab_predict_batch(
    project_id: UUID,
    files: list[UploadFile] = File(...),
    conf: float = Form(LAB_DEFAULTS["conf"]),
    iou: float = Form(LAB_DEFAULTS["iou"]),
    imgsz: int = Form(LAB_DEFAULTS["imgsz"]),
    api_key: str | None = Form(None),
    include_raw: bool = Form(False),
    user: User = Depends(get_current_user),
):
    del project_id, user
    if not files:
        raise HTTPException(status_code=400, detail="لا ملفات")
    if len(files) > 60:
        raise HTTPException(status_code=400, detail="الحد الأقصى 60 إطار")

    url, resolved_key = _lab_auth_and_url(api_key)
    batch_started = time.perf_counter()
    items: list[tuple[bytes, str, str]] = []
    meta: list[tuple[str, str, int]] = []

    for idx, upload in enumerate(files):
        content = await upload.read()
        if not content:
            continue
        if len(content) > 80 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="الحد الأقصى 80MB لكل ملف")
        filename = upload.filename or f"frame_{idx}.jpg"
        content_type = upload.content_type or "image/jpeg"
        items.append((content, content_type, filename))
        meta.append((filename, content_type, len(content)))

    try:
        payloads = await call_predict_many(
            url=url,
            api_key=resolved_key,
            items=items,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            concurrency=LAB_BATCH_CONCURRENCY,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="انتهت مهلة API — قلّل عدد الإطارات") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"تعذّر الاتصال بـ API: {exc}") from exc
    except LabPredictError as exc:
        if exc.status_code == 401:
            raise HTTPException(status_code=401, detail=f"مفتاح API غير صالح: {exc.message}") from exc
        raise HTTPException(status_code=exc.status_code, detail=f"خطأ من API: {exc.message}") from exc

    results = []
    for idx, (payload, latency_ms, inference_ms) in enumerate(payloads):
        if not isinstance(payload, dict):
            continue
        filename, content_type, size_bytes = meta[idx]
        results.append(_build_predict_response(
            payload=payload,
            latency_ms=latency_ms,
            inference_ms=inference_ms,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            include_raw=include_raw,
        ))

    return {
        "results": results,
        "count": len(results),
        "total_latency_ms": round((time.perf_counter() - batch_started) * 1000, 1),
        "params": {"conf": conf, "iou": iou, "imgsz": imgsz},
    }


@router.post("/{project_id}/demo/seed")
async def seed_demo_data(
    project_id: UUID,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    from app.services.demo.iraq_demo_seed import seed_iraq_demo

    result = await seed_iraq_demo(db, project_id, force=force)
    await db.commit()
    return result


@router.post("/{project_id}/demo/attach-images")
async def attach_demo_images_endpoint(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    from app.services.demo.attach_demo_images import attach_demo_images

    settings = get_settings()
    source_dir = resolve_data_path(settings.demo_images_dir)
    upload_root = resolve_data_path(settings.evidence_upload_dir)

    result = await attach_demo_images(
        db,
        project_id,
        source_dir=source_dir,
        upload_dir=upload_root,
    )

    if result.get("attached", 0) > 0:
        events = await db.execute(
            select(RoadEvent).where(RoadEvent.project_id == project_id, RoadEvent.is_active == True)
        )
        for event in events.scalars().all():
            meta = event.extra_metadata or {}
            if not meta.get("image_url"):
                continue
            payload = serialize_road_event(event)
            await publish_road_event_update(project_id, payload)

    await db.commit()
    return result


@router.post("/{project_id}/events/{event_id}/evidence")
async def upload_event_evidence(
    project_id: UUID,
    event_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    result = await db.execute(
        select(RoadEvent).where(RoadEvent.id == event_id, RoadEvent.project_id == project_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="التنبيه غير موجود")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="ارفع ملف صورة فقط")

    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"

    settings = get_settings()
    upload_root = resolve_data_path(settings.evidence_upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)
    filename = f"{event_id}{ext}"
    dest = upload_root / filename
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="الحد الأقصى 12MB")

    dest.write_bytes(data)

    meta = dict(event.extra_metadata or {})
    meta["image_url"] = f"/uploads/evidence/{filename}"
    event.extra_metadata = meta
    await db.flush()

    payload = serialize_road_event(event)
    await publish_road_event_update(project_id, payload)
    await db.commit()
    return payload


@router.get("/{project_id}/system")
async def control_center_system(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """Health snapshot for control-center system & integrations pages."""
    from urllib.parse import urlparse

    from sqlalchemy import text

    from app.core.database import engine
    from app.core.redis_client import get_redis
    from app.services.models.active_model import get_active_model

    settings = get_settings()

    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    redis_ok = False
    try:
        redis = await get_redis()
        redis_ok = bool(await redis.ping())
    except Exception:
        pass

    artifact = await get_active_model(db, project_id)
    online = await db.execute(
        select(func.count(FleetDevice.id)).where(
            FleetDevice.project_id == project_id,
            FleetDevice.is_online == True,
        )
    )
    total_devices = await db.execute(
        select(func.count(FleetDevice.id)).where(FleetDevice.project_id == project_id)
    )

    predict_url = resolve_predict_url(settings.cloud_predict_url)
    api_key_ok = bool(resolve_api_key(None))
    lab_host = urlparse(predict_url.replace("/predict", "")).netloc if predict_url else None

    return {
        "version": "4.0",
        "service": settings.app_name,
        "database": {"status": "ok" if db_ok else "error"},
        "redis": {"status": "ok" if redis_ok else "offline"},
        "lab": {
            "configured": bool(predict_url),
            "api_key_configured": api_key_ok,
            "endpoint_label": LAB_ENDPOINT_LABEL,
            "url_host": lab_host,
        },
        "websocket": {
            "path": f"/api/v1/ws/road-intelligence/{project_id}",
            "status": "ready",
        },
        "active_model": {
            "ready": artifact is not None,
            "name": artifact.name if artifact else None,
            "architecture": artifact.architecture if artifact else None,
        },
        "fleet": {
            "online": online.scalar() or 0,
            "total": total_devices.scalar() or 0,
        },
        "integrations": [
            {"id": "postgresql", "name": "PostgreSQL", "kind": "database", "status": "connected" if db_ok else "error"},
            {"id": "redis", "name": "Redis", "kind": "cache", "status": "connected" if redis_ok else "offline"},
            {
                "id": "ultralytics",
                "name": "Ultralytics Cloud",
                "kind": "inference",
                "status": "connected" if api_key_ok and predict_url else ("needs_key" if predict_url else "offline"),
                "detail": LAB_ENDPOINT_LABEL if predict_url else None,
            },
            {"id": "websocket", "name": "Road Intelligence WS", "kind": "realtime", "status": "ready"},
            {
                "id": "edge_model",
                "name": "Edge Model",
                "kind": "ml",
                "status": "connected" if artifact else "offline",
                "detail": artifact.name if artifact else None,
            },
        ],
    }


def _extract_annotated_image(payload: dict | list) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("annotated_image", "image", "output_image", "result_image"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            if val.startswith("data:"):
                return val
            return f"data:image/jpeg;base64,{val}"
    return None


def _normalize_detections(payload: dict | list) -> list[dict]:
    items: list = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        images = payload.get("images")
        if isinstance(images, list):
            for image in images:
                if isinstance(image, dict) and isinstance(image.get("results"), list):
                    items.extend(image["results"])
        if not items:
            for key in ("predictions", "detections", "results", "objects", "boxes"):
                val = payload.get(key)
                if isinstance(val, list):
                    items = val
                    break
        if not items and isinstance(payload.get("data"), dict):
            nested = payload["data"]
            for key in ("predictions", "detections", "results"):
                val = nested.get(key)
                if isinstance(val, list):
                    items = val
                    break

    out: list[dict] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        cls = (
            item.get("name")
            or item.get("class_name")
            or item.get("class")
            or item.get("label")
            or item.get("name")
            or "unknown"
        )
        if isinstance(cls, (int, float)):
            cls = str(int(cls))
        conf = item.get("confidence", item.get("conf", item.get("score", 0)))
        bbox = item.get("bbox") or item.get("box") or item.get("xyxy")
        if isinstance(bbox, dict):
            if all(k in bbox for k in ("x1", "y1", "x2", "y2")):
                bbox = [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]]
            elif all(k in bbox for k in ("x", "y", "width", "height")):
                x, y, w, h = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
                bbox = [x, y, x + w, y + h]
        if bbox is None and all(k in item for k in ("x1", "y1", "x2", "y2")):
            bbox = [item["x1"], item["y1"], item["x2"], item["y2"]]
        if bbox is None and all(k in item for k in ("x", "y", "width", "height")):
            x, y, w, h = item["x"], item["y"], item["width"], item["height"]
            bbox = [x, y, x + w, y + h]
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            continue
        try:
            nums = [float(b) for b in bbox]
        except (TypeError, ValueError):
            continue
        out.append({
            "id": str(item.get("id") or idx),
            "class": str(cls),
            "confidence": round(float(conf), 4),
            "bbox": nums,
        })
    return out


def _notification_message(event: RoadEvent) -> str:
    labels = {
        RoadEventType.ACCIDENT: "تم رصد حادث — يتطلب استجابة فورية",
        RoadEventType.POTHOLE: "حفرة في الطريق — إرسال لفرق الصيانة",
        RoadEventType.SPEED_BUMP: "مطب سرعة — إرسال للبلدية",
        RoadEventType.TRAFFIC_VIOLATION: "مخالفة مرورية — إشعار للمرور",
        RoadEventType.ROAD_CLOSED: "طريق مغلق — تحديث للخرائط الحية",
        RoadEventType.FLOODED_ROAD: "فيضان على الطريق — خطر عالي",
        RoadEventType.CONSTRUCTION: "أعمال طرق — تنبيه للسائقين",
        RoadEventType.ROAD_CRACK: "شقوق في الطريق",
        RoadEventType.BARRIER: "حاجز على الطريق",
    }
    base = labels.get(event.event_type, f"تنبيه: {event.event_type.value}")
    recipient = default_recipient(event.event_type)
    targets = {
        "ambulance": "الإسعاف",
        "police": "الشرطة",
        "municipality": "البلدية",
        "traffic": "المرور",
        "fleet": "الأسطول",
    }
    return f"{base} · موجه إلى: {targets.get(recipient, recipient)}"


async def publish_road_event_update(project_id: UUID, payload: dict) -> None:
    try:
        from app.core.redis_client import get_redis

        redis = await get_redis()
        await redis.publish(f"road:{project_id}", json.dumps(payload))
    except Exception:
        pass
