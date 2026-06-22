"""Roboflow pothole-manhole model class labels — Arabic and event mapping."""

from app.models import RoadEventType

ROBOFLOW_CLASS_LABELS_AR: dict[str, str] = {
    "pothole": "حفرة",
    "manhole": "بالوعة",
    "speedbreaker": "مطب",
    "asfalt_zemin": "أسفلت",
    "parke_zemin": "بلاط",
}

ROBOFLOW_CLASS_COLORS: dict[str, str] = {
    "pothole": "#C7FC00",
    "manhole": "#FE0056",
    "speedbreaker": "#FF8000",
    "asfalt_zemin": "#8622FF",
    "parke_zemin": "#00FFCE",
}

ROBOFLOW_CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "pothole": RoadEventType.POTHOLE,
    "manhole": RoadEventType.POTHOLE,
    "speedbreaker": RoadEventType.ROAD_CRACK,
}


def roboflow_label_ar(class_name: str) -> str | None:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return ROBOFLOW_CLASS_LABELS_AR.get(key)


def roboflow_class_color(class_name: str) -> str | None:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return ROBOFLOW_CLASS_COLORS.get(key)
