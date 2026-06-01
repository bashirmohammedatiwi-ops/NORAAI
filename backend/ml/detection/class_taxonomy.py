"""Map dashboard class names to detection behaviour (road / damage / vehicle)."""

from __future__ import annotations

ROAD_SURFACE_CLASSES = frozenset({
    "pothole",
    "road_crack",
    "damaged_road",
    "flooded_road",
    "barrier",
    "construction",
    "speed_sign",
    "traffic_light",
    "road_closed",
})

VEHICLE_DAMAGE_CLASSES = frozenset({
    "accident",
    "vehicle_damage",
    "car_damage",
    "accident_damage",
    "collision_damage",
    "crash_damage",
})

VEHICLE_CLASSES = frozenset({
    "vehicle",
    "car",
    "truck",
    "bus",
    "motorcycle",
})


def normalize_class_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def detection_mode(class_name: str) -> str:
    """road = pothole/crack on pavement; damage = dent/crash on vehicle; vehicle = whole car."""
    n = normalize_class_name(class_name)
    if n in ROAD_SURFACE_CLASSES or n.startswith("pothole") or n.endswith("_crack"):
        return "road"
    if n in VEHICLE_DAMAGE_CLASSES or ("damage" in n and "road" not in n):
        return "damage"
    if n in VEHICLE_CLASSES:
        return "vehicle"
    return "general"


def is_road_class(class_name: str) -> bool:
    return detection_mode(class_name) == "road"


def is_damage_class(class_name: str) -> bool:
    return detection_mode(class_name) == "damage"
