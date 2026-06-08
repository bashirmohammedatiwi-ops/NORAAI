"""Remote configuration for the mobile driver app."""

from __future__ import annotations

import copy
from typing import Any

from app.models import Project

DEFAULT_MOBILE_CONFIG: dict[str, Any] = {
    "inference_mode": "local",
    "detection_enabled": True,
    "min_confidence": 0.45,
    "scan_fps": 12,
    "speed_violation": {
        "enabled": True,
        "tolerance_kmh": 5,
        "grace_seconds": 3,
        "cooldown_seconds": 60,
        "fallback_limit_kmh": 80,
    },
    "camera": {
        "max_width": 640,
        "jpeg_quality": 0.72,
    },
    "sync": {
        "promote_as_active_on_deploy": False,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, val in override.items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def get_mobile_config(project: Project | None) -> dict[str, Any]:
    if not project:
        return copy.deepcopy(DEFAULT_MOBILE_CONFIG)
    raw = project.mobile_config if isinstance(project.mobile_config, dict) else {}
    return _deep_merge(DEFAULT_MOBILE_CONFIG, raw)


def patch_mobile_config(project: Project, updates: dict[str, Any]) -> dict[str, Any]:
    current = get_mobile_config(project)
    merged = _deep_merge(current, updates)
    project.mobile_config = merged
    return merged
