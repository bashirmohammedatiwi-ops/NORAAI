"""Fleet presence — online if heartbeat within TTL."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import FleetDevice

FLEET_ONLINE_TTL_SECONDS = 90


def fleet_online_cutoff(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now - timedelta(seconds=FLEET_ONLINE_TTL_SECONDS)


def fleet_device_is_online(device: FleetDevice, *, now: datetime | None = None) -> bool:
    if device.last_communication is None:
        return False
    lc = device.last_communication
    if lc.tzinfo is None:
        lc = lc.replace(tzinfo=timezone.utc)
    return lc >= fleet_online_cutoff(now)
