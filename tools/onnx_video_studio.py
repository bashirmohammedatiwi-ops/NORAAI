#!/usr/bin/env python3
"""Local ONNX video studio — serves docs/Nurai-ONNX-Studio.html and runs inference."""

from __future__ import annotations

import argparse
import json
import mimetypes
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "docs" / "Nurai-ONNX-Studio.html"

# Arabic labels for known classes (English key → Arabic display)
CLASS_LABELS_AR: dict[str, str] = {
    "pothole": "حفرة/مطب",
    "pothile": "حفرة",
    "manhole": "بالوعة",
    "crack": "تشقق",
    "speedbreaker": "مطب",
    "speed_breacker": "مطب",
    "asfalt": "أسفلت",
    "asfalt_zemin": "أسفلت",
    "parke": "بلاط",
    "parke_zemin": "بلاط",
    "d00": "شق طولي",
    "d10": "شق عرضي",
    "d20": "تشققات متشابكة",
    "d40": "حفرة",
    "repair": "منطقة مُصلحة",
    "accident": "حادث",
    "vehicle": "مركبة",
    "person": "شخص",
    "car": "سيارة",
    "truck": "شاحنة",
    "bus": "حافلة",
    "motorcycle": "دراجة نارية",
    "bicycle": "دراجة",
}

KNOWN_MODELS: dict[str, dict] = {
    "main-model": {
        "classes": ["Pothole", "Crack", "Manhole", "accident"],
        "image_size": 320,
        "resize_mode": "letterbox",
    },
    "pothole-manhole": {
        "classes": ["pothole", "manhole", "speedbreaker", "asfalt_zemin", "parke_zemin"],
        "image_size": 640,
        "resize_mode": "stretch",
    },
    "accident-gtowx": {
        "classes": ["Accident"],
        "image_size": 640,
        "resize_mode": "stretch",
    },
}

MODEL_DISPLAY: dict[str, str] = {
    "main-model": "📱 Main Model — موديل الهاتف (حفرة · تشقق · بالوعة)",
    "rasid-drive": "📱 RASID Roboflow — (حفر · مطب · بالوعة)",
    "pothole-manhole": "📱 RASID Roboflow — (حفر · مطب · بالوعة)",
    "traffic-accident": "كشف الحوادث (YOLO11x)",
    "accident-gtowx": "كشف الحوادث (Roboflow)",
    "rdd2022": "تشققات الطرق (RDD2022)",
}


def label_ar(class_name: str) -> str:
    key = class_name.strip().lower().replace(" ", "_").replace("-", "_")
    return CLASS_LABELS_AR.get(key, class_name)


def json_safe(obj: object) -> object:
    """Convert numpy scalars/arrays to native Python types for JSON."""
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def resolve_model_config(model_path: Path, manifest: dict | None = None) -> dict:
    """Merge manifest, sidecar .classes.json, inference_config, and known-model defaults."""
    cfg: dict = {"classes": [], "image_size": 640, "resize_mode": "stretch"}

    if manifest:
        if manifest.get("classes"):
            cfg["classes"] = [str(c) for c in manifest["classes"]]
        cfg["image_size"] = int(manifest.get("image_size") or cfg["image_size"])
        if manifest.get("resize_mode"):
            cfg["resize_mode"] = str(manifest["resize_mode"]).lower()

    # Sidecar: model.classes.json (studio format)
    sidecar = model_path.with_suffix(".classes.json")
    if sidecar.exists():
        try:
            sc = json.loads(sidecar.read_text(encoding="utf-8"))
            if sc.get("classes"):
                cfg["classes"] = [str(c) for c in sc["classes"]]
            cfg["image_size"] = int(sc.get("image_size") or cfg["image_size"])
            if sc.get("resize_mode"):
                cfg["resize_mode"] = str(sc["resize_mode"]).lower()
        except Exception:
            pass

    # Roboflow inference_config
    infer_cfg_path = model_path.parent / f"{model_path.stem}_inference_config.json"
    if infer_cfg_path.exists():
        try:
            ic = json.loads(infer_cfg_path.read_text(encoding="utf-8"))
            net = ic.get("network_input") or {}
            size = net.get("training_input_size") or {}
            if size.get("height"):
                cfg["image_size"] = int(size["height"])
            if net.get("resize_mode"):
                cfg["resize_mode"] = str(net["resize_mode"]).lower()
        except Exception:
            pass

    stem = model_path.stem.lower()
    for key, known in KNOWN_MODELS.items():
        if key in stem and not cfg["classes"]:
            cfg.update(known)
            break

    if not cfg["classes"]:
        cfg["classes"] = ModelSession._guess_classes(model_path)

    cfg["labels_ar"] = {c: label_ar(c) for c in cfg["classes"]}
    return cfg


def class_score(raw: float) -> float:
    if 0.0 <= raw <= 1.0:
        return raw
    if raw > 1.0:
        return float(1.0 / (1.0 + np.exp(-raw)))
    return raw


def iou(a: dict, b: dict) -> float:
    ix1 = max(a["x1"], b["x1"])
    iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"])
    iy2 = min(a["y2"], b["y2"])
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    union = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"]) + (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]) - inter
    return inter / union if union > 0 else 0.0


def nms(boxes: list[dict], iou_thresh: float = 0.45) -> list[dict]:
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    kept: list[dict] = []
    for box in boxes:
        if any(iou(box, k) > iou_thresh for k in kept):
            continue
        kept.append(box)
    return kept


def letterbox_layout(orig_w: int, orig_h: int, imgsz: int) -> tuple[float, int, int, int, int]:
    """Match mobile OnnxPrepResult padding (Ultralytics letterbox)."""
    gain = min(imgsz / orig_h, imgsz / orig_w)
    new_w = int(round(orig_w * gain))
    new_h = int(round(orig_h * gain))
    pad_top = int(round((imgsz - new_h) / 2.0 - 0.1))
    pad_left = int(round((imgsz - new_w) / 2.0 - 0.1))
    return gain, new_w, new_h, pad_top, pad_left


def normalize_class_key(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def looks_like_roboflow(classes: list[str]) -> bool:
    keys = {normalize_class_key(c) for c in classes}
    return bool(
        keys & {"pothole", "manhole", "asfalt_zemin", "parke_zemin", "speedbreaker", "speed_breacker"}
    )


STUDIO_DECODE_FLOOR = 0.01  # match backend / phone cloud ONNX — decode wide, filter after


def effective_class_confidence(class_name: str, base: float) -> float:
    """Per-class floors — bumps/potholes share a lower floor unless user is in strict mode."""
    key = normalize_class_key(class_name)
    if base >= 0.55:
        return base
    if key in ("speedbreaker", "speed_breacker", "pothole", "pothile"):
        return min(base, 0.12)
    if base >= 0.22:
        return base
    if key == "crack":
        return min(base, 0.10)
    return base


def mobile_infer_confidence(min_confidence: float) -> float:
    """Post-decode filter threshold (user slider). Decode itself uses STUDIO_DECODE_FLOOR."""
    user = max(0.01, min(0.99, float(min_confidence)))
    if user >= 0.45:
        return user
    if user <= 0.15:
        return user
    scheduled = max(0.22, min(0.50, user * 0.82))
    return max(scheduled * 0.88, 0.20)


def decode_infer_floor(_min_confidence: float) -> float:
    return STUDIO_DECODE_FLOOR


SURFACE_CLASS_KEYS = frozenset({"asfalt_zemin", "parke_zemin", "asfalt", "parke"})
BUMP_CLASS_KEYS = frozenset({"speedbreaker", "speed_breacker", "pothole", "pothile"})


def pick_anchor_class(
    scores: np.ndarray,
    class_names: list[str],
    *,
    cy_norm: float,
    roboflow: bool,
) -> tuple[int, float]:
    """Match mobile: score every class; prefer road defects over surface tiles in Roboflow."""
    use_nc = min(len(class_names), len(scores))
    best_idx = 0
    best_score = -1.0
    bump_idx = 0
    bump_score = 0.0
    surface_score = 0.0

    for c in range(use_nc):
        sc = class_score(float(scores[c]))
        if sc > best_score:
            best_score = sc
            best_idx = c
        key = normalize_class_key(class_names[c])
        if key in BUMP_CLASS_KEYS and sc > bump_score:
            bump_score = sc
            bump_idx = c
        if key in SURFACE_CLASS_KEYS and sc > surface_score:
            surface_score = sc

    if roboflow and cy_norm >= 0.35:
        top_key = normalize_class_key(class_names[best_idx])
        # RASID PT/ONNX: surface tiles often beat speedbreaker on the same anchor — prefer bump in road zone.
        if top_key in SURFACE_CLASS_KEYS and bump_score >= 0.025:
            best_idx, best_score = bump_idx, bump_score
        elif bump_score >= 0.04 and bump_score >= surface_score * 0.45:
            best_idx, best_score = bump_idx, bump_score
        elif bump_score > best_score and bump_score >= 0.03:
            best_idx, best_score = bump_idx, bump_score

    return best_idx, best_score


def normalize_bump_class(class_name: str, class_names: list[str]) -> str:
    """RASID often fires pothole for speed bumps — show as speedbreaker when that class exists."""
    key = normalize_class_key(class_name)
    if key not in ("pothole", "pothile"):
        return class_name
    names = {normalize_class_key(c) for c in class_names}
    if "speedbreaker" in names:
        for c in class_names:
            if normalize_class_key(c) == "speedbreaker":
                return c
    return class_name


def bump_display_class(class_names: list[str]) -> str:
    names = {normalize_class_key(c) for c in class_names}
    if "speedbreaker" in names:
        for c in class_names:
            if normalize_class_key(c) == "speedbreaker":
                return c
    if "pothole" in names:
        for c in class_names:
            if normalize_class_key(c) == "pothole":
                return c
    return "Pothole"


def merge_phone_bump_aux(
    primary: list[dict],
    aux: list[dict],
    primary_classes: list[str],
) -> list[dict]:
    """Merge main-model Pothole hits into RASID results — matches phone VPS model."""
    target = bump_display_class(primary_classes)
    merged: list[dict] = []

    for det in primary:
        key = normalize_class_key(det.get("class", ""))
        bb = det.get("bbox") or []
        if key in SURFACE_CLASS_KEYS and len(bb) >= 4 and float(bb[3]) > 0.45:
            continue
        merged.append(det)

    for det in aux:
        key = normalize_class_key(det.get("class", ""))
        if key not in ("pothole", "pothile"):
            continue
        bb = det.get("bbox") or []
        if len(bb) < 4 or float(bb[3]) < 0.45:
            continue
        area = (float(bb[2]) - float(bb[0])) * (float(bb[3]) - float(bb[1]))
        if area < 0.00015:
            continue
        merged.append(
            {
                **det,
                "class": target,
                "label_ar": label_ar(target),
                "aux_from": "main-model",
            }
        )

    nms_in: list[dict] = []
    for det in merged:
        bb = det.get("bbox") or [0, 0, 0, 0]
        nms_in.append(
            {
                **det,
                "x1": float(bb[0]),
                "y1": float(bb[1]),
                "x2": float(bb[2]),
                "y2": float(bb[3]),
            }
        )
    kept = nms(nms_in, iou_thresh=0.45)[:80]
    for det in kept:
        det.pop("x1", None)
        det.pop("y1", None)
        det.pop("x2", None)
        det.pop("y2", None)
    return kept


_AUX_PHONE_MODEL: "ModelSession | None" = None


def get_phone_aux_model() -> "ModelSession | None":
    """Cached main-model — same ONNX the mobile app syncs from VPS."""
    global _AUX_PHONE_MODEL
    path = ROOT / "models" / "pretrained" / "mobile" / "main-model.onnx"
    if not path.is_file():
        return None
    if _AUX_PHONE_MODEL is None:
        _AUX_PHONE_MODEL = ModelSession()
    if not _AUX_PHONE_MODEL.is_loaded or _AUX_PHONE_MODEL.model_path != str(path):
        _AUX_PHONE_MODEL.load(path)
    return _AUX_PHONE_MODEL


def prepare_input(image_bytes: bytes, imgsz: int, *, stretch: bool) -> tuple[np.ndarray, int, int, dict]:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    orig_h, orig_w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    prep: dict = {"stretch": stretch, "imgsz": imgsz, "gain": 1.0, "pad_top": 0, "pad_left": 0}
    if stretch:
        resized = cv2.resize(rgb, (imgsz, imgsz), interpolation=cv2.INTER_LINEAR)
    else:
        gain, new_w, new_h, pad_top, pad_left = letterbox_layout(orig_w, orig_h, imgsz)
        prep.update({"gain": gain, "pad_top": pad_top, "pad_left": pad_left})
        resized = cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
        canvas[pad_top : pad_top + new_h, pad_left : pad_left + new_w] = resized
        resized = canvas
    tensor = resized.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, orig_w, orig_h, prep


def _coords_are_normalized(flat: np.ndarray) -> bool:
    """YOLO exports may use 0–1 or 0–imgsz pixel coords."""
    if flat.size == 0:
        return False
    sample = flat[: min(512, flat.size)]
    return float(np.max(np.abs(sample))) <= 1.5


def decode_yolo_output(
    output: np.ndarray,
    class_names: list[str],
    *,
    min_confidence: float,
    orig_w: int,
    orig_h: int,
    imgsz: int,
    stretch: bool,
    iou_thresh: float = 0.55,
    prep: dict | None = None,
) -> list[dict]:
    data = np.asarray(output, dtype=np.float32)
    if data.ndim == 3:
        data = data[0]
    if data.ndim != 2:
        return []

    gain = float((prep or {}).get("gain") or min(imgsz / orig_h, imgsz / orig_w))
    pad_left = int((prep or {}).get("pad_left") or 0)
    pad_top = int((prep or {}).get("pad_top") or 0)
    if not stretch and prep is None:
        _, _, _, pad_top, pad_left = letterbox_layout(orig_w, orig_h, imgsz)

    decode_floor = decode_infer_floor(min_confidence)
    post_conf = mobile_infer_confidence(min_confidence)
    roboflow = looks_like_roboflow(class_names)

    # End-to-end (1, N, 6) baked NMS
    if data.shape[1] == 6 and data.shape[0] <= 1000:
        candidates: list[dict] = []
        nc = len(class_names)
        for i in range(data.shape[0]):
            row = data[i]
            x1, y1, x2, y2, score, cls_id = row
            score = class_score(float(score))
            cid = int(cls_id) % max(nc, 1)
            cname = class_names[cid] if cid < nc else f"class_{cid}"
            if score < decode_floor:
                continue
            cname = normalize_bump_class(cname, class_names)
            if score < effective_class_confidence(cname, post_conf):
                continue
            if x2 <= 1.5 and y2 <= 1.5:
                bx = [float(x1), float(y1), float(x2), float(y2)]
            elif stretch:
                bx = [
                    max(0.0, min(1.0, float(x1) / imgsz)),
                    max(0.0, min(1.0, float(y1) / imgsz)),
                    max(0.0, min(1.0, float(x2) / imgsz)),
                    max(0.0, min(1.0, float(y2) / imgsz)),
                ]
            else:
                bx = [
                    max(0.0, min(1.0, (float(x1) - pad_left) / gain / orig_w)),
                    max(0.0, min(1.0, (float(y1) - pad_top) / gain / orig_h)),
                    max(0.0, min(1.0, (float(x2) - pad_left) / gain / orig_w)),
                    max(0.0, min(1.0, (float(y2) - pad_top) / gain / orig_h)),
                ]
            candidates.append(
                {
                    "class": cname,
                    "confidence": float(score),
                    "bbox": [float(v) for v in bx],
                }
            )
        return nms(
            [
                {**c, "x1": c["bbox"][0], "y1": c["bbox"][1], "x2": c["bbox"][2], "y2": c["bbox"][3]}
                for c in candidates
            ],
            iou_thresh=iou_thresh,
        )[:50]

    if data.shape[0] < data.shape[1]:
        data = data.T

    num_rows, num_ch = data.shape
    nc = len(class_names)
    tensor_nc = num_ch - 4
    if tensor_nc < 1 or num_rows < 100:
        return []
    use_nc = min(nc, tensor_nc)
    norm_coords = _coords_are_normalized(data[:, :4].reshape(-1))
    decode_floor = decode_infer_floor(min_confidence)
    post_conf = mobile_infer_confidence(min_confidence)
    roboflow = looks_like_roboflow(class_names)
    candidates = []

    for i in range(num_rows):
        cx, cy, w, h = (float(v) for v in data[i, 0:4])
        if norm_coords:
            cx *= imgsz
            cy *= imgsz
            w *= imgsz
            h *= imgsz
        scores = data[i, 4 : 4 + use_nc]
        cy_norm = (cy / imgsz) if stretch else (cy - pad_top) / gain / max(orig_h, 1)
        if roboflow and cy_norm >= 0.35:
            bump_pick_idx = -1
            bump_pick_score = 0.0
            for c in range(use_nc):
                key = normalize_class_key(class_names[c])
                if key not in BUMP_CLASS_KEYS:
                    continue
                sc = class_score(float(scores[c]))
                if sc > bump_pick_score:
                    bump_pick_score = sc
                    bump_pick_idx = c
            if bump_pick_idx >= 0 and bump_pick_score >= decode_floor:
                best_idx, best_score = bump_pick_idx, bump_pick_score
            else:
                best_idx, best_score = pick_anchor_class(
                    scores, class_names, cy_norm=float(cy_norm), roboflow=roboflow,
                )
        else:
            best_idx, best_score = pick_anchor_class(
                scores, class_names, cy_norm=float(cy_norm), roboflow=roboflow,
            )
        cname = class_names[best_idx] if best_idx < len(class_names) else f"class_{best_idx}"
        if best_score < decode_floor:
            continue

        if stretch:
            x1 = max(0.0, min(1.0, (cx - w / 2) / imgsz))
            y1 = max(0.0, min(1.0, (cy - h / 2) / imgsz))
            x2 = max(0.0, min(1.0, (cx + w / 2) / imgsz))
            y2 = max(0.0, min(1.0, (cy + h / 2) / imgsz))
        else:
            cx -= pad_left
            cy -= pad_top
            left = (cx - w / 2) / gain
            top = (cy - h / 2) / gain
            width = w / gain
            height = h / gain
            x1 = max(0.0, min(1.0, left / orig_w))
            y1 = max(0.0, min(1.0, top / orig_h))
            x2 = max(0.0, min(1.0, (left + width) / orig_w))
            y2 = max(0.0, min(1.0, (top + height) / orig_h))

        if x2 <= x1 or y2 <= y1:
            continue
        area = (x2 - x1) * (y2 - y1)
        if area < 0.0002 or area > 0.95:
            continue
        cname = normalize_bump_class(cname, class_names)
        if best_score < effective_class_confidence(cname, post_conf):
            continue
        candidates.append(
            {
                "class": cname,
                "confidence": float(best_score),
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "x1": float(x1),
                "y1": float(y1),
                "x2": float(x2),
                "y2": float(y2),
            }
        )

    kept = nms(candidates, iou_thresh=iou_thresh)[:80]
    for box in kept:
        box.pop("x1", None)
        box.pop("y1", None)
        box.pop("x2", None)
        box.pop("y2", None)
    return kept


class ModelSession:
    def __init__(self) -> None:
        self.backend: str | None = None  # "onnx" | "pt"
        self.session = None
        self.yolo_model = None
        self.torch_model = None  # onnx2torch GraphModule
        self.pt_format: str | None = None  # "ultralytics" | "onnx2torch"
        self.input_name: str | None = None
        self.output_name: str | None = None
        self.class_names: list[str] = []
        self.imgsz = 640
        self.stretch = True
        self.model_path: str | None = None
        self.iou_thresh = 0.55

    @property
    def is_loaded(self) -> bool:
        return self.backend is not None

    def load(self, model_path: Path, manifest: dict | None = None) -> dict:
        suffix = model_path.suffix.lower()
        if suffix == ".pt":
            return self._load_pt(model_path, manifest)
        if suffix == ".onnx":
            return self._load_onnx(model_path, manifest)
        raise ValueError(f"Unsupported model format: {suffix} (use .onnx or .pt)")

    def _reset(self) -> None:
        self.backend = None
        self.session = None
        self.yolo_model = None
        self.torch_model = None
        self.pt_format = None
        self.input_name = None
        self.output_name = None

    def _load_onnx(self, model_path: Path, manifest: dict | None = None) -> dict:
        import onnxruntime as ort

        self._reset()
        cfg = resolve_model_config(model_path, manifest)
        classes = cfg["classes"]
        imgsz = int(cfg["image_size"])
        stretch = str(cfg.get("resize_mode", "stretch")).lower() == "stretch"

        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        # Prefer real ONNX input dims (mobile uses 320×320 for Main Model).
        try:
            in_shape = self.session.get_inputs()[0].shape
            if len(in_shape) == 4:
                h = int(in_shape[2]) if in_shape[2] else 0
                w = int(in_shape[3]) if in_shape[3] else 0
                if h > 0:
                    imgsz = h
                if w > 0 and h <= 0:
                    imgsz = w
        except Exception:
            pass

        nc = self._infer_nc_from_output()
        if nc and nc != len(classes):
            if len(classes) > nc:
                classes = classes[:nc]
            elif len(classes) < nc:
                classes = classes + [f"class_{i}" for i in range(len(classes), nc)]

        self.class_names = classes
        self.imgsz = imgsz
        self.stretch = stretch
        self.model_path = str(model_path)
        self.backend = "onnx"
        labels_ar = {c: label_ar(c) for c in classes}

        return {
            "classes": classes,
            "labels_ar": labels_ar,
            "image_size": imgsz,
            "resize_mode": "stretch" if stretch else "letterbox",
            "model": model_path.name,
            "backend": "onnx",
        }

    def _load_pt(self, model_path: Path, manifest: dict | None = None) -> dict:
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("لتشغيل .pt ثبّت: pip install torch") from exc

        self._reset()
        cfg = resolve_model_config(model_path, manifest)

        # Studio PT converted from ONNX (onnx2torch) — same weights as .onnx
        try:
            ckpt = torch.load(str(model_path), map_location="cpu", weights_only=False)
            if isinstance(ckpt, dict) and ckpt.get("format") == "onnx2torch" and ckpt.get("model") is not None:
                self.torch_model = ckpt["model"]
                self.torch_model.eval()
                self.pt_format = "onnx2torch"
                names = ckpt.get("names") or {}
                if isinstance(names, dict):
                    classes = [str(names[i]) for i in sorted(names.keys())]
                else:
                    classes = [str(n) for n in names]
                if not classes and cfg["classes"]:
                    classes = cfg["classes"]
                imgsz = int(ckpt.get("imgsz") or cfg["image_size"])
                stretch = str(ckpt.get("resize_mode") or cfg.get("resize_mode", "stretch")).lower() == "stretch"
                self.class_names = classes
                self.imgsz = imgsz
                self.stretch = stretch
                self.model_path = str(model_path)
                self.backend = "pt"
                labels_ar = {c: label_ar(c) for c in classes}
                return {
                    "classes": classes,
                    "labels_ar": labels_ar,
                    "image_size": imgsz,
                    "resize_mode": "stretch" if stretch else "letterbox",
                    "model": model_path.name,
                    "backend": "pt",
                    "pt_format": "onnx2torch",
                }
        except Exception:
            pass

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError(
                "لتشغيل .pt ثبّت: pip install torch torchvision ultralytics"
            ) from exc

        self.yolo_model = YOLO(str(model_path))
        self.pt_format = "ultralytics"
        names = self.yolo_model.names or {}
        if isinstance(names, dict):
            classes = [str(names[i]) for i in sorted(names.keys()) if str(i).isdigit() or isinstance(i, int)]
            if not classes:
                classes = [str(v) for v in names.values()]
        else:
            classes = [str(n) for n in names]

        if not classes and cfg["classes"]:
            classes = cfg["classes"]

        imgsz = int(cfg["image_size"])
        if hasattr(self.yolo_model, "overrides") and self.yolo_model.overrides.get("imgsz"):
            imgsz = int(self.yolo_model.overrides["imgsz"])

        self.class_names = classes
        self.imgsz = imgsz
        stretch = str(cfg.get("resize_mode", "stretch")).lower() == "stretch"
        if not stretch and looks_like_roboflow(classes):
            stretch = True
        self.stretch = stretch
        self.model_path = str(model_path)
        self.backend = "pt"
        labels_ar = {c: label_ar(c) for c in classes}

        return {
            "classes": classes,
            "labels_ar": labels_ar,
            "image_size": imgsz,
            "resize_mode": "stretch" if stretch else "letterbox",
            "model": model_path.name,
            "backend": "pt",
            "pt_format": "ultralytics",
        }

    def _infer_nc_from_output(self) -> int | None:
        session = self.session
        if session is None:
            return None
        try:
            shape = session.get_outputs()[0].shape
            if len(shape) == 3:
                d1, d2 = int(shape[1]), int(shape[2])
                if 5 <= d1 <= 200 and d2 > 100:
                    return d1 - 4
                if 5 <= d2 <= 200 and d1 > 100:
                    return d2 - 4
            if len(shape) == 2 and shape[1] == 6:
                return len(self.class_names) or 1
        except Exception:
            pass
        return None

    @staticmethod
    def _guess_classes(model_path: Path) -> list[str]:
        stem = model_path.stem.lower()
        if "rdd" in stem:
            return ["D00", "D10", "D20", "D40", "Repair"]
        if "pothole" in stem or "manhole" in stem:
            return ["pothole", "manhole", "speedbreaker", "asfalt_zemin", "parke_zemin"]
        if "accident" in stem:
            return ["Accident"]
        if "coco" in stem:
            return [
                "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
            ]
        # Local trainer typo names
        local = ROOT / "local-trainer" / "data" / "classes.json"
        if local.exists():
            try:
                raw = json.loads(local.read_text(encoding="utf-8"))
                names = [str(x.get("name", "")).strip() for x in raw if x.get("name")]
                if names:
                    return names
            except Exception:
                pass
        return [f"class_{i}" for i in range(5)]

    def detect(
        self,
        image_bytes: bytes,
        min_confidence: float,
        *,
        iou_thresh: float | None = None,
        phone_aux: bool = True,
    ) -> tuple[list[dict], int]:
        if not self.is_loaded:
            raise RuntimeError("Model not loaded")
        iou = iou_thresh if iou_thresh is not None else self.iou_thresh
        if self.backend == "pt":
            boxes, latency_ms = self._detect_pt(image_bytes, min_confidence, iou_thresh=iou)
        else:
            boxes, latency_ms = self._detect_onnx(image_bytes, min_confidence, iou_thresh=iou)

        if phone_aux and looks_like_roboflow(self.class_names):
            aux = get_phone_aux_model()
            if aux is not None and aux.model_path != self.model_path:
                aux_boxes, aux_ms = aux.detect(
                    image_bytes,
                    min_confidence,
                    iou_thresh=iou,
                    phone_aux=False,
                )
                boxes = merge_phone_bump_aux(boxes, aux_boxes, self.class_names)
                latency_ms = max(latency_ms, aux_ms)
        return boxes, latency_ms

    def _detect_onnx(self, image_bytes: bytes, min_confidence: float, *, iou_thresh: float = 0.45) -> tuple[list[dict], int]:
        if self.session is None or not self.input_name or not self.output_name:
            raise RuntimeError("ONNX session not ready")

        t0 = time.perf_counter()
        post_conf = mobile_infer_confidence(min_confidence)
        decode_floor = decode_infer_floor(min_confidence)
        tensor, orig_w, orig_h, prep = prepare_input(image_bytes, self.imgsz, stretch=self.stretch)
        outputs = self.session.run([self.output_name], {self.input_name: tensor})
        boxes = decode_yolo_output(
            outputs[0],
            self.class_names,
            min_confidence=decode_floor,
            orig_w=orig_w,
            orig_h=orig_h,
            imgsz=self.imgsz,
            stretch=self.stretch,
            iou_thresh=iou_thresh,
            prep=prep,
        )
        for b in boxes:
            b["label_ar"] = label_ar(b["class"])
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return boxes, latency_ms

    def _detect_pt(self, image_bytes: bytes, min_confidence: float, *, iou_thresh: float = 0.45) -> tuple[list[dict], int]:
        if self.pt_format == "onnx2torch":
            return self._detect_onnx2torch_pt(image_bytes, min_confidence, iou_thresh=iou_thresh)
        if self.yolo_model is None:
            raise RuntimeError("PT model not ready")

        t0 = time.perf_counter()
        post_conf = mobile_infer_confidence(min_confidence)
        decode_floor = decode_infer_floor(min_confidence)

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        # Roboflow models are trained with stretch — pre-resize before Ultralytics predict.
        if self.stretch:
            img = cv2.resize(img, (self.imgsz, self.imgsz), interpolation=cv2.INTER_LINEAR)

        results = self.yolo_model.predict(
            img,
            conf=decode_floor,
            iou=iou_thresh,
            imgsz=self.imgsz,
            max_det=80,
            verbose=False,
            device="cpu",
            augment=False,
        )

        filtered: list[dict] = []
        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue
            names = result.names or {}
            for box in boxes:
                xy = box.xyxyn[0].tolist()
                x1, y1, x2, y2 = (float(v) for v in xy)
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                class_name = str(names.get(cls_id, self.class_names[cls_id] if cls_id < len(self.class_names) else f"class_{cls_id}"))
                class_name = normalize_bump_class(class_name, self.class_names)
                if conf < effective_class_confidence(class_name, post_conf):
                    continue
                filtered.append(
                    {
                        "class": class_name,
                        "confidence": conf,
                        "bbox": [x1, y1, x2, y2],
                        "label_ar": label_ar(class_name),
                    }
                )

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return filtered[:80], latency_ms

    def _detect_onnx2torch_pt(self, image_bytes: bytes, min_confidence: float, *, iou_thresh: float = 0.45) -> tuple[list[dict], int]:
        import torch

        if self.torch_model is None:
            raise RuntimeError("onnx2torch PT model not ready")

        t0 = time.perf_counter()
        post_conf = mobile_infer_confidence(min_confidence)
        decode_floor = decode_infer_floor(min_confidence)
        tensor, orig_w, orig_h, prep = prepare_input(image_bytes, self.imgsz, stretch=self.stretch)
        with torch.no_grad():
            output = self.torch_model(torch.from_numpy(tensor))
        if isinstance(output, (list, tuple)):
            output = output[0]
        boxes = decode_yolo_output(
            output.detach().cpu().numpy(),
            self.class_names,
            min_confidence=decode_floor,
            orig_w=orig_w,
            orig_h=orig_h,
            imgsz=self.imgsz,
            stretch=self.stretch,
            iou_thresh=iou_thresh,
            prep=prep,
        )
        for b in boxes:
            b["label_ar"] = label_ar(b["class"])
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return boxes, latency_ms


MODEL = ModelSession()


def _pt_available() -> bool:
    try:
        import ultralytics  # noqa: F401
        return True
    except ImportError:
        return False


def scan_models(models_dir: Path) -> list[dict]:
    if not models_dir.is_dir():
        return []
    items = []
    patterns = ("*.onnx", "*.pt")
    seen: set[str] = set()
    for pattern in patterns:
        for p in sorted(models_dir.rglob(pattern)):
            if p.suffix.lower() == ".pt":
                fmt = "pt"
            else:
                fmt = "onnx"
            rel = p.relative_to(models_dir).as_posix()
            if rel in seen:
                continue
            seen.add(rel)
            sidecar = p.with_suffix(".classes.json")
            entry = {
                "name": rel,
                "path": str(p),
                "format": fmt,
                "size_mb": round(p.stat().st_size / (1024 * 1024), 1),
            }
            cfg = resolve_model_config(p)
            entry["classes"] = cfg.get("classes") or []
            entry["labels_ar"] = cfg.get("labels_ar") or {}
            display = rel
            stem_lower = p.stem.lower()
            rel_lower = rel.lower()
            for key, label in MODEL_DISPLAY.items():
                if key in stem_lower or key in rel_lower:
                    display = f"{label} — {rel}"
                    break
            entry["display_name"] = display
            if sidecar.exists():
                entry["has_sidecar"] = True
            items.append(entry)
  # RASID Roboflow PT first (dashboard / Roboflow export), then mobile ONNX
    items.sort(
        key=lambda e: (
            0 if "pothole-manhole" in e.get("name", "") and e.get("format") == "pt" else 1,
            0 if "rasid-drive" in e.get("name", "") and e.get("format") == "onnx" else 1,
            0 if "main-model" in e.get("name", "") and e.get("format") == "onnx" else 1,
            1 if e.get("format") == "pt" else 0,
            e["name"],
        )
    )
    return items


class Handler(BaseHTTPRequestHandler):
    server_version = "NuraiONNXStudio/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[studio] {self.address_string()} {fmt % args}")

    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(json_safe(payload), ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            if not HTML_PATH.exists():
                self._send_json(404, {"error": f"Missing {HTML_PATH}"})
                return
            data = HTML_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/models":
            models_dir = getattr(self.server, "models_dir", ROOT / "models" / "pretrained")
            self._send_json(200, {"models": scan_models(models_dir)})
            return

        if path == "/api/status":
            labels_ar = {c: label_ar(c) for c in MODEL.class_names}
            self._send_json(
                200,
                {
                    "loaded": MODEL.is_loaded,
                    "backend": MODEL.backend,
                    "model": MODEL.model_path,
                    "classes": MODEL.class_names,
                    "labels_ar": labels_ar,
                    "image_size": MODEL.imgsz,
                    "resize_mode": "stretch" if MODEL.stretch else "letterbox",
                    "pt_available": _pt_available(),
                },
            )
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/load-model":
            ctype = self.headers.get("Content-Type", "")
            if "application/json" in ctype:
                payload = json.loads(self._read_body().decode("utf-8"))
                model_path = Path(payload.get("path", ""))
                if not model_path.is_file():
                    self._send_json(400, {"error": "Model path not found"})
                    return
                manifest = payload.get("manifest")
                info = MODEL.load(model_path, resolve_model_config(model_path, manifest))
                self._send_json(200, {"ok": True, **info})
                return

            # multipart: model file (.onnx / .pt) + optional manifest json
            import cgi

            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": ctype},
            )
            onnx_file = form["model"] if "model" in form else None
            manifest_file = form["manifest"] if "manifest" in form else None
            if onnx_file is None or not getattr(onnx_file, "file", None):
                self._send_json(400, {"error": "Missing model file"})
                return

            with tempfile.TemporaryDirectory() as tmp:
                uploaded = form["model"].filename or "model.onnx"
                model_path = Path(tmp) / uploaded
                model_path.write_bytes(onnx_file.file.read())
                manifest = None
                if manifest_file is not None and getattr(manifest_file, "file", None):
                    try:
                        manifest = json.loads(manifest_file.file.read().decode("utf-8"))
                    except Exception:
                        pass
                models_dir = getattr(self.server, "models_dir", ROOT / "models" / "pretrained")
                models_dir.mkdir(parents=True, exist_ok=True)
                dest = models_dir / uploaded
                dest.write_bytes(model_path.read_bytes())
                if manifest:
                    dest.with_suffix(".classes.json").write_text(
                        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
                    )
                info = MODEL.load(dest, manifest)

            self._send_json(200, {"ok": True, **info})
            return

        if path == "/api/detect":
            qs = parse_qs(urlparse(self.path).query)
            min_conf = float((qs.get("min_confidence") or ["0.15"])[0])
            iou = float((qs.get("iou") or ["0.45"])[0])
            image_bytes = self._read_body()
            if not image_bytes:
                self._send_json(400, {"error": "Empty image"})
                return
            try:
                detections, latency_ms = MODEL.detect(image_bytes, min_conf, iou_thresh=iou)
                self._send_json(200, {"detections": detections, "latency_ms": latency_ms})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return

        self._send_json(404, {"error": "Not found"})


def main() -> None:
    parser = argparse.ArgumentParser(description="NURAI ONNX Video Studio — local server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--models-dir", default=str(ROOT / "models" / "pretrained"))
    parser.add_argument("--model", help="Auto-load model (.onnx or .pt) on startup")
    parser.add_argument("--manifest", help="Manifest JSON for --model")
    args = parser.parse_args()

    models_dir = Path(args.models_dir)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.models_dir = models_dir  # type: ignore[attr-defined]

    if not args.model:
        for candidate in (
            models_dir / "roboflow" / "pothole-manhole-2_v2.pt",
            models_dir / "mobile" / "rasid-drive.onnx",
            models_dir / "mobile" / "main-model.onnx",
        ):
            if candidate.is_file():
                args.model = str(candidate)
                break

    if args.model:
        manifest = None
        if args.manifest:
            manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        else:
            mp = Path(args.model).with_suffix(".classes.json")
            if mp.exists():
                manifest = json.loads(mp.read_text(encoding="utf-8"))
        info = MODEL.load(Path(args.model), manifest)
        print(f"[studio] Loaded {args.model} [{info.get('backend', '?')}] — {len(info['classes'])} classes")

    url = f"http://{args.host}:{args.port}/"
    print(f"[studio] NURAI ONNX Studio → {url}")
    print(f"[studio] Models dir: {models_dir}")
    if _pt_available():
        print("[studio] PT support: ✓ ultralytics")
    else:
        print("[studio] PT support: ✗ pip install torch torchvision ultralytics")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[studio] stopped")


if __name__ == "__main__":
    main()
