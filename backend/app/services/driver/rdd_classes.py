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


def rdd_label_ar(class_name: str) -> str | None:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return RDD_CLASS_LABELS_AR.get(key)
