"""Map YOLO weight class names to dashboard ClassLabel names for colors/events."""

from __future__ import annotations

from app.services.driver.project_classes import normalize_class_name

_ALIASES: dict[str, str] = {
    "accident": "حوادث",
    "accidents": "حوادث",
    "crash": "حوادث",
    "car": "car",
    "vehicle": "car",
    "damage": "حوادث",
    "pothole": "حفر",
    "potholes": "حفر",
    "manhole": "حفر",
    "speedbreaker": "حفر",
}


def resolve_display_class_name(model_name: str, project_names: list[str]) -> str:
    norm_project = {normalize_class_name(n): n for n in project_names}
    raw = model_name.strip()
    key = normalize_class_name(raw)
    if key in norm_project:
        return norm_project[key]
    alias = _ALIASES.get(key)
    if alias and normalize_class_name(alias) in norm_project:
        return norm_project[normalize_class_name(alias)]
    for pname in project_names:
        if normalize_class_name(pname) in key or key in normalize_class_name(pname):
            return pname
    return raw
