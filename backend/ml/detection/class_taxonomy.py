"""Map dashboard class names to detection behaviour (road / damage / vehicle)."""

from __future__ import annotations

# Primary two-class project labels (Arabic)
ACCIDENT_CLASS_NAMES = frozenset({
    "حوادث",
    "حادث",
    "accident",
    "vehicle_damage",
    "car_damage",
    "accident_damage",
    "collision_damage",
    "crash_damage",
})

POTHOLE_CLASS_NAMES = frozenset({
    "حفر",
    "حفرة",
    "pothole",
    "road_crack",
    "damaged_road",
    "flooded_road",
})

ROAD_SURFACE_CLASSES = POTHOLE_CLASS_NAMES | frozenset({
    "barrier",
    "construction",
    "speed_sign",
    "traffic_light",
    "road_closed",
})

VEHICLE_DAMAGE_CLASSES = ACCIDENT_CLASS_NAMES

VEHICLE_CLASSES = frozenset({
    "vehicle",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "مركبة",
})


def normalize_class_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def detection_mode(class_name: str) -> str:
    """road = حفر/عيوب الطريق; damage = حوادث على المركبات; vehicle = whole car (legacy)."""
    n = normalize_class_name(class_name)
    if n in POTHOLE_CLASS_NAMES or n.startswith("pothole") or n.endswith("_crack"):
        return "road"
    if n in ACCIDENT_CLASS_NAMES or ("damage" in n and "road" not in n):
        return "damage"
    if n in VEHICLE_CLASSES:
        return "vehicle"
    return "general"


def is_road_class(class_name: str) -> bool:
    return detection_mode(class_name) == "road"


def is_damage_class(class_name: str) -> bool:
    return detection_mode(class_name) == "damage"
