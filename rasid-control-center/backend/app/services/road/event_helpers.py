"""Helpers for road event serialization and routing defaults."""

from app.models.fleet import RoadEvent, RoadEventType

RECIPIENT_BY_EVENT: dict[RoadEventType, str] = {
    RoadEventType.ACCIDENT: "ambulance",
    RoadEventType.POTHOLE: "municipality",
    RoadEventType.SPEED_BUMP: "municipality",
    RoadEventType.ROAD_CRACK: "municipality",
    RoadEventType.BARRIER: "municipality",
    RoadEventType.ROAD_CLOSED: "municipality",
    RoadEventType.TRAFFIC_VIOLATION: "traffic",
    RoadEventType.CONSTRUCTION: "municipality",
    RoadEventType.FLOODED_ROAD: "municipality",
}

SEVERITY_BY_EVENT: dict[RoadEventType, str] = {
    RoadEventType.ACCIDENT: "critical",
    RoadEventType.POTHOLE: "medium",
    RoadEventType.SPEED_BUMP: "medium",
    RoadEventType.ROAD_CRACK: "low",
    RoadEventType.BARRIER: "high",
    RoadEventType.ROAD_CLOSED: "high",
    RoadEventType.TRAFFIC_VIOLATION: "medium",
    RoadEventType.CONSTRUCTION: "low",
    RoadEventType.FLOODED_ROAD: "high",
}


def public_event_type(event: RoadEvent) -> str:
    """API/frontend event type — manhole is stored as pothole + detection_class metadata."""
    meta = event.extra_metadata or {}
    if meta.get("detection_class") == "manhole":
        return "manhole"
    return event.event_type.value


def default_recipient(event_type: RoadEventType) -> str:
    return RECIPIENT_BY_EVENT.get(event_type, "municipality")


def default_severity(event_type: RoadEventType) -> str:
    return SEVERITY_BY_EVENT.get(event_type, "medium")


def serialize_road_event(event: RoadEvent) -> dict:
    meta = dict(event.extra_metadata or {})
    recipient = meta.get("recipient") or default_recipient(event.event_type)
    severity = meta.get("severity") or default_severity(event.event_type)
    image_url = meta.get("image_url") or meta.get("evidence_url")
    return {
        "id": str(event.id),
        "event_type": public_event_type(event),
        "latitude": event.latitude,
        "longitude": event.longitude,
        "confidence": event.confidence,
        "is_active": event.is_active,
        "created_at": event.created_at.isoformat(),
        "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
        "device_id": meta.get("vehicle_id") or meta.get("device_code") or None,
        "metadata": meta,
        "recipient": recipient,
        "municipality_id": meta.get("municipality_id"),
        "severity": severity,
        "image_url": image_url,
        "title": meta.get("title"),
        "reference": meta.get("reference"),
        "block_ar": meta.get("block_ar"),
        "street_ar": meta.get("street_ar"),
        "vehicle_id": meta.get("vehicle_id"),
        "device_code": meta.get("device_code"),
        "source_vehicle": meta.get("source_vehicle"),
    }
