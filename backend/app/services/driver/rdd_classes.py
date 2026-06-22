"""RDD2022 damage class codes — Arabic labels and event mapping."""

from app.models import RoadEventType

RDD_CLASS_LABELS_AR: dict[str, str] = {
    "d00": "شق طولي",
    "d10": "شق عرضي",
    "d20": "تشققات متشابكة",
    "d40": "حفرة",
    "repair": "منطقة مُصلحة",
}

RDD_CLASS_TO_EVENT: dict[str, RoadEventType] = {
    "d00": RoadEventType.ROAD_CRACK,
    "d10": RoadEventType.ROAD_CRACK,
    "d20": RoadEventType.ROAD_CRACK,
    "d40": RoadEventType.POTHOLE,
}

RDD_CLASS_COLORS: dict[str, str] = {
    "d00": "#CA8A04",
    "d10": "#EAB308",
    "d20": "#84CC16",
    "d40": "#F97316",
    "repair": "#64748B",
}


def rdd_class_color(class_name: str) -> str | None:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return RDD_CLASS_COLORS.get(key)


def rdd_label_ar(class_name: str) -> str | None:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return RDD_CLASS_LABELS_AR.get(key)
