"""Compare manual-test predictions with stored annotations."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Annotation, AnnotationStatus, ClassLabel, Image
from app.services.driver.project_classes import normalize_class_name


def bbox_iou(a: list[float], b: list[float]) -> float:
    if len(a) < 4 or len(b) < 4:
        return 0.0
    ax1, ay1, ax2, ay2 = a[:4]
    bx1, by1, bx2, by2 = b[:4]
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _ann_to_bbox(ann: Annotation) -> list[float]:
    cx, cy, w, h = ann.x_center, ann.y_center, ann.width, ann.height
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


async def load_ground_truth(
    db: AsyncSession,
    project_id: uuid.UUID,
    image_id: uuid.UUID,
) -> tuple[list[dict], list[str]]:
    image = await db.get(Image, image_id)
    if not image or image.project_id != project_id:
        return [], ["الصورة غير موجودة في هذا المشروع"]

    rows = await db.execute(
        select(Annotation, ClassLabel.name)
        .join(ClassLabel, ClassLabel.id == Annotation.class_id)
        .where(
            Annotation.image_id == image_id,
            Annotation.status.in_(
                (AnnotationStatus.APPROVED, AnnotationStatus.EDITED, AnnotationStatus.PENDING_REVIEW)
            ),
        )
    )

    labels: list[dict] = []
    for ann, class_name in rows.all():
        labels.append({
            "class": class_name,
            "bbox": _ann_to_bbox(ann),
        })
    return labels, []


def compare_predictions(
    predictions: list[dict],
    ground_truth: list[dict],
    *,
    iou_threshold: float = 0.3,
) -> dict:
    """Match predictions to labels by class + IoU."""
    if not ground_truth:
        return {
            "label_count": 0,
            "matched_labels": 0,
            "matches": [],
            "unmatched_labels": [],
            "diagnostics": ["لا توجد تسميات على هذه الصورة"],
        }

    used_preds: set[int] = set()
    matches: list[dict] = []
    unmatched: list[dict] = []

    for gt in ground_truth:
        gt_class = normalize_class_name(gt["class"])
        gt_bbox = gt["bbox"]
        best_idx = -1
        best_iou = 0.0
        best_conf = 0.0
        for i, pred in enumerate(predictions):
            if i in used_preds:
                continue
            if normalize_class_name(pred.get("class", "")) != gt_class:
                continue
            iou = bbox_iou(gt_bbox, pred.get("bbox") or [])
            conf = float(pred.get("confidence") or 0)
            if iou >= iou_threshold and (iou > best_iou or (iou == best_iou and conf > best_conf)):
                best_idx = i
                best_iou = iou
                best_conf = conf

        if best_idx >= 0:
            used_preds.add(best_idx)
            pred = predictions[best_idx]
            matches.append({
                "class": gt["class"],
                "iou": round(best_iou, 3),
                "confidence": round(float(pred.get("confidence") or 0), 3),
            })
        else:
            unmatched.append({"class": gt["class"], "bbox": gt_bbox})

    diagnostics: list[str] = []
    matched = len(matches)
    total = len(ground_truth)
    if total and matched == 0:
        diagnostics.append(
            "الموديل لم يطابق أي تسمية على صورة التدريب — راجع الفئات (حوادث+حفر فقط) أو أعد التدريب"
        )
    elif matched < total:
        diagnostics.append(f"طُابق {matched} من {total} تسميات فقط")
    elif matched == total:
        avg_conf = sum(m["confidence"] for m in matches) / matched if matched else 0
        if avg_conf < 0.35:
            diagnostics.append(
                f"كل التسميات طُابقت لكن الثقة منخفضة ({avg_conf:.0%}) — الموديل ضعيف رغم التدريب"
            )

    return {
        "label_count": total,
        "matched_labels": matched,
        "matches": matches,
        "unmatched_labels": unmatched,
        "diagnostics": diagnostics,
    }


def build_manual_test_warnings(
    meta: dict,
    *,
    ground_truth_eval: dict | None = None,
    from_dataset: bool = False,
) -> list[str]:
    warnings: list[str] = []
    best = float(meta.get("best_confidence") or 0)
    raw = int(meta.get("raw_detection_count") or 0)
    threshold = float(meta.get("confidence_threshold") or 0.01)

    if meta.get("class_names_mismatch"):
        warnings.append("أسماء الفئات في الموديل لا تطابق المشروع — أعد التدريب بعد توحيد الفئات")

    if raw == 0:
        warnings.append(
            "الموديل لم يُنتج أي صندوق حتى بأقل عتبة — تحقق أن التدريب اكتمل بأوزان حقيقية (ليس mock)"
        )
    elif best < threshold:
        warnings.append(f"أعلى ثقة {best:.0%} أقل من العتبة {threshold:.0%}")

    if from_dataset and ground_truth_eval:
        warnings.extend(ground_truth_eval.get("diagnostics") or [])

    metrics = meta.get("training_map50")
    if metrics is not None and float(metrics) < 0.4:
        warnings.append(
            f"دقة التدريب (Detection accuracy) {float(metrics):.0%} — منخفضة؛ لا تتوقع نتائج عالية على صور التدريب"
        )

    return warnings
