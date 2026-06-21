"""YOLO ZIP import and Ultralytics dataset layout builder."""

from __future__ import annotations

import random
import re
import shutil
import zipfile
from pathlib import Path
from typing import Callable

import yaml

from backend.config import DATASETS_DIR
from backend.storage import create_dataset, dataset_dir, list_classes

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
LABEL_DIRS = ("labels-yolo", "labels", "labels_yolo")
IMAGE_DIRS = ("images", "imgs", "image")


def _stem(path: Path) -> str:
    return path.stem.lower()


def _parse_yolo_lines(text: str) -> list[tuple[int, float, float, float, float]]:
    rows: list[tuple[int, float, float, float, float]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            continue
        try:
            rows.append((int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])))
        except ValueError:
            continue
    return rows


def _read_data_yaml_names(root: Path) -> list[str]:
    for candidate in (root / "data.yaml", root / "dataset.yaml"):
        if not candidate.exists():
            continue
        try:
            text = candidate.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        bracket = re.search(r"names:\s*\[(.*?)\]", text, re.DOTALL)
        if bracket:
            return re.findall(r"['\"]([^'\"]+)['\"]", bracket.group(1))
    return []


def analyze_zip(zip_path: Path) -> dict:
    raw_images = 0
    raw_labels = 0
    matched = 0
    labeled = 0
    detected: set[int] = set()
    yolo_names = _read_data_yaml_names(zip_path.parent)

    with zipfile.ZipFile(zip_path, "r") as zf:
        image_stems: dict[str, str] = {}
        label_stems: dict[str, str] = {}

        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            lower = name.lower()
            ext = Path(lower).suffix
            parts = lower.split("/")
            base_name = parts[-1]

            if ext in IMAGE_EXTS:
                raw_images += 1
                image_stems[_stem(Path(base_name))] = name
            elif ext == ".txt" and base_name != "classes.txt":
                if any(d in parts for d in LABEL_DIRS) or "label" in lower:
                    raw_labels += 1
                    label_stems[_stem(Path(base_name))] = name

        common = set(image_stems.keys()) & set(label_stems.keys())
        matched = len(image_stems)
        labeled = len(common)

        for stem in common:
            with zf.open(label_stems[stem]) as f:
                text = f.read().decode("utf-8", errors="ignore")
            for cls_id, *_ in _parse_yolo_lines(text):
                detected.add(cls_id)

        if not yolo_names and zf:
            for info in zf.infolist():
                if info.filename.lower().endswith("classes.txt"):
                    with zf.open(info) as f:
                        yolo_names = [ln.strip() for ln in f.read().decode().splitlines() if ln.strip()]
                    break

    warning = None
    if raw_images == 0 and raw_labels > 0:
        warning = "ZIP contains labels only — include images folder."
    elif raw_images > 0 and matched == 0:
        warning = "Images found but no matching label filenames."
    elif raw_labels == 0 and raw_images > 0:
        warning = "Images without .txt label files."

    return {
        "image_count": matched,
        "labeled_count": labeled,
        "raw_image_files": raw_images,
        "raw_label_files": raw_labels,
        "detected_class_ids": sorted(detected),
        "yolo_class_names": yolo_names,
        "warning": warning,
        "valid": matched > 0 and labeled > 0,
    }


def _remap_label_file(
    text: str,
    class_mapping: dict[int, int],
) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            continue
        old_id = int(parts[0])
        new_id = class_mapping.get(old_id, old_id)
        lines.append(f"{new_id} {parts[1]} {parts[2]} {parts[3]} {parts[4]}")
    return "\n".join(lines) + ("\n" if lines else "")


def import_yolo_zip(
    zip_path: Path,
    class_mapping: dict[str, str],
    val_split: float = 0.15,
    progress_callback: Callable[[str, int], None] | None = None,
) -> dict:
    """
    Import YOLO ZIP into local dataset folder with Ultralytics layout.
    class_mapping: yolo_class_id (str) -> project class name (str)
    """
    extract_root = zip_path.parent / "extracted"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_root)

    preview = analyze_zip(zip_path)
    if not preview["valid"]:
        raise ValueError(preview.get("warning") or "Invalid YOLO dataset ZIP")

    platform_classes = list_classes()
    name_to_idx: dict[str, int] = {}
    ordered_names: list[str] = []
    for c in platform_classes:
        name_to_idx[c["name"]] = len(ordered_names)
        ordered_names.append(c["name"])

    yolo_id_remap: dict[int, int] = {}
    for yolo_id_str, class_name in class_mapping.items():
        if class_name not in name_to_idx:
            idx = len(ordered_names)
            name_to_idx[class_name] = idx
            ordered_names.append(class_name)
        yolo_id_remap[int(yolo_id_str)] = name_to_idx[class_name]

    image_files: list[Path] = []
    label_map: dict[str, Path] = {}

    for path in extract_root.rglob("*"):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        rel = path.relative_to(extract_root)
        parts = [p.lower() for p in rel.parts]
        if ext in IMAGE_EXTS:
            image_files.append(path)
        elif ext == ".txt" and path.name != "classes.txt":
            if any(d in parts for d in LABEL_DIRS) or "label" in "/".join(parts):
                label_map[_stem(path)] = path

    pairs: list[tuple[Path, Path | None]] = []
    for img in image_files:
        stem = _stem(img)
        pairs.append((img, label_map.get(stem)))

    random.shuffle(pairs)
    val_count = max(1, int(len(pairs) * val_split)) if len(pairs) > 1 else 0
    val_pairs = pairs[:val_count]
    train_pairs = pairs[val_count:] if val_count else pairs

    dataset_id = str(__import__("uuid").uuid4())
    root = dataset_dir(dataset_id)
    yolo_root = root / "yolo"
    for sub in ("images/train", "images/val", "labels/train", "labels/val"):
        (yolo_root / sub).mkdir(parents=True, exist_ok=True)

    imported = 0
    annotations = 0

    def copy_pair(img: Path, lbl: Path | None, split: str, idx: int) -> None:
        nonlocal imported, annotations
        dest_img = yolo_root / "images" / split / f"{idx:06d}{img.suffix.lower()}"
        shutil.copy2(img, dest_img)
        imported += 1
        if lbl and lbl.exists():
            text = lbl.read_text(encoding="utf-8", errors="ignore")
            remapped = _remap_label_file(text, yolo_id_remap)
            dest_lbl = yolo_root / "labels" / split / f"{idx:06d}.txt"
            dest_lbl.write_text(remapped, encoding="utf-8")
            annotations += sum(1 for ln in remapped.splitlines() if ln.strip())
        if progress_callback:
            progress_callback("import", int((imported / max(len(pairs), 1)) * 100))

    for i, (img, lbl) in enumerate(train_pairs):
        copy_pair(img, lbl, "train", i)
    for i, (img, lbl) in enumerate(val_pairs):
        copy_pair(img, lbl, "val", i)

    data_yaml = {
        "path": str(yolo_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "nc": len(ordered_names),
        "names": ordered_names,
    }
    yaml_path = yolo_root / "data.yaml"
    yaml_path.write_text(yaml.dump(data_yaml, default_flow_style=False), encoding="utf-8")

    meta = create_dataset({
        "name": zip_path.stem,
        "image_count": imported,
        "labeled_count": preview["labeled_count"],
        "annotations": annotations,
        "class_names": ordered_names,
        "data_yaml": str(yaml_path),
        "yolo_root": str(yolo_root),
    })

    shutil.rmtree(extract_root, ignore_errors=True)
    return meta
