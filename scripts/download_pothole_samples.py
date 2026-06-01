#!/usr/bin/env python3
"""
Download pothole road images from open datasets (RDD2022 — research use).

Sources (legitimate, annotated road damage data):
  - RDD2022 Czech Republic subset (CRDDC 2022)
  - Optional: Cracks-and-Potholes Mendeley dataset if more images needed

Usage:
  python scripts/download_pothole_samples.py
  python scripts/download_pothole_samples.py --count 200 --output data/pothole_samples
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parent.parent

# RDD2022 — D40 = pothole (https://github.com/sekilab/RoadDamageDetector)
RDD_CZECH_ZIP = (
    "https://bigdatacup.s3.ap-northeast-1.amazonaws.com/2022/CRDDC2022/RDD2022/"
    "Country_Specific_Data_CRDDC2022/RDD2022_Czech.zip"
)
RDD_CHINA_MB_ZIP = (
    "https://bigdatacup.s3.ap-northeast-1.amazonaws.com/2022/CRDDC2022/RDD2022/"
    "Country_Specific_Data_CRDDC2022/RDD2022_China_MotorBike.zip"
)
MENDELEY_POTHOLES_ZIP = (
    "https://data.mendeley.com/datasets/t576ydh9v8/3/files/"
    "afc7c028-06e0-475b-b190-e008df681b19/Cracks-and-Potholes-in-Road-Images.zip?dl=1"
)

POTHOLE_LABELS = {"d40", "pothole", "potholes"}


def log(msg: str) -> None:
    print(msg, flush=True)


def download(url: str, dest: Path) -> None:
    log(f"Downloading {dest.name} ...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file():
        dest.unlink()

    def progress(block: int, block_size: int, total: int) -> None:
        if total <= 0:
            return
        pct = min(100, block * block_size * 100 // total)
        if block % 100 == 0:
            print(f"\r  {pct}%", end="", flush=True)

    urlretrieve(url, dest, reporthook=progress)
    print(flush=True)
    size_mb = dest.stat().st_size / (1024 * 1024)
    log(f"  Saved {size_mb:.1f} MB")
    if not zipfile.is_zipfile(dest):
        dest.unlink(missing_ok=True)
        raise RuntimeError(f"Download failed or incomplete: {dest.name}")


def valid_zip(path: Path, min_mb: float = 50.0) -> bool:
    if not path.is_file():
        return False
    if path.stat().st_size < min_mb * 1024 * 1024:
        return False
    return zipfile.is_zipfile(path)


def xml_has_pothole(xml_path: Path) -> bool:
    try:
        root = ET.parse(xml_path).getroot()
    except ET.ParseError:
        return False
    for obj in root.findall(".//object"):
        name = obj.findtext("name", "").strip().lower()
        if name in POTHOLE_LABELS:
            return True
    return False


def image_for_xml(xml_path: Path, search_roots: list[Path]) -> Path | None:
    stem = xml_path.stem
    for ext in (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"):
        for root in search_roots:
            candidate = root / f"{stem}{ext}"
            if candidate.is_file():
                return candidate
            for hit in root.rglob(f"{stem}{ext}"):
                return hit
    return None


def collect_from_rdd_zip(zip_path: Path, extract_dir: Path) -> list[tuple[Path, Path]]:
    log(f"Extracting {zip_path.name} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    xml_files = list(extract_dir.rglob("*.xml"))
    search_roots = [extract_dir]
    pairs: list[tuple[Path, Path]] = []
    seen: set[str] = set()

    for xml_path in xml_files:
        if not xml_has_pothole(xml_path):
            continue
        img = image_for_xml(xml_path, search_roots)
        if not img:
            continue
        key = img.name.lower()
        if key in seen:
            continue
        seen.add(key)
        pairs.append((img, xml_path))

    log(f"  Found {len(pairs)} pothole images in {zip_path.name}")
    return pairs


def collect_from_mendeley_zip(zip_path: Path, extract_dir: Path) -> list[Path]:
    """Images whose pothole mask is non-empty."""
    log(f"Extracting {zip_path.name} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    images: list[Path] = []
    seen: set[str] = set()

    for mask in extract_dir.rglob("*pothole*mask*.png"):
        if mask.stat().st_size < 500:
            continue
        stem = mask.stem.replace("_pothole_mask", "").replace("-pothole", "").replace("_mask", "")
        for img in extract_dir.rglob(f"{stem}.*"):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            if "mask" in img.name.lower():
                continue
            key = img.name.lower()
            if key not in seen:
                seen.add(key)
                images.append(img)
            break

    if len(images) < 50:
        for img in extract_dir.rglob("*.jpg"):
            if "pothole" in str(img.parent).lower() and "mask" not in img.name.lower():
                key = img.name.lower()
                if key not in seen:
                    seen.add(key)
                    images.append(img)

    log(f"  Found {len(images)} pothole images in Mendeley dataset")
    return images


def copy_samples(pairs: list[tuple[Path, Path | None]], output: Path, start_index: int, limit: int) -> int:
    output.mkdir(parents=True, exist_ok=True)
    count = 0
    idx = start_index
    for img_path, _meta in pairs:
        if count >= limit:
            break
        dest = output / f"pothole_{idx:04d}{img_path.suffix.lower()}"
        shutil.copy2(img_path, dest)
        idx += 1
        count += 1
    return count


def copy_plain_images(images: list[Path], output: Path, start_index: int, limit: int) -> int:
    output.mkdir(parents=True, exist_ok=True)
    count = 0
    idx = start_index
    for img_path in images:
        if count >= limit:
            break
        dest = output / f"pothole_{idx:04d}{img_path.suffix.lower()}"
        shutil.copy2(img_path, dest)
        idx += 1
        count += 1
    return count


def write_readme(output: Path, total: int) -> None:
    readme = output / "README.txt"
    readme.write_text(
        f"Pothole sample images ({total} files)\n"
        "================================\n\n"
        "Source: RDD2022 (CRDDC 2022) and/or Cracks-and-Potholes dataset.\n"
        "License: research / academic use — cite the original dataset authors.\n\n"
        "RDD2022 citation:\n"
        "  Arya et al., RDD2022: A multi-national image dataset for automatic\n"
        "  road damage detection, Geoscience Data Journal, 2024.\n\n"
        "Upload to NORAAI: use Dataset Builder with class 'pothole'.\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Download pothole road images from open datasets")
    parser.add_argument("--count", type=int, default=200, help="Number of images (default: 200)")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "pothole_samples")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "_download_cache")
    args = parser.parse_args()

    output: Path = args.output
    cache: Path = args.cache

    if output.exists():
        for old in output.glob("pothole_*.*"):
            old.unlink()

    need = args.count
    total = 0
    index = 1
    all_pairs: list[tuple[Path, Path | None]] = []

    with tempfile.TemporaryDirectory(dir=cache if cache.exists() else None) as tmp:
        tmp_path = Path(tmp)
        cache.mkdir(parents=True, exist_ok=True)

        sources = [
            ("RDD2022_Czech.zip", RDD_CZECH_ZIP),
            ("RDD2022_China_MotorBike.zip", RDD_CHINA_MB_ZIP),
        ]

        for name, url in sources:
            if need <= 0:
                break
            zip_file = cache / name
            if not valid_zip(zip_file):
                if zip_file.is_file():
                    log(f"  Removing incomplete {name}")
                    zip_file.unlink()
                try:
                    download(url, zip_file)
                except Exception as exc:
                    log(f"  Skip {name}: {exc}")
                    continue
            extract = tmp_path / name.replace(".zip", "")
            try:
                pairs = collect_from_rdd_zip(zip_file, extract)
                all_pairs.extend(pairs)
            except Exception as exc:
                log(f"  Error reading {name}: {exc}")

        if len(all_pairs) < args.count:
            mend_zip = cache / "Cracks-and-Potholes.zip"
            if not mend_zip.is_file():
                try:
                    download(MENDELEY_POTHOLES_ZIP, mend_zip)
                except Exception as exc:
                    log(f"  Skip Mendeley: {exc}")
            if mend_zip.is_file():
                extract = tmp_path / "mendeley"
                try:
                    imgs = collect_from_mendeley_zip(mend_zip, extract)
                    for img in imgs:
                        all_pairs.append((img, None))
                except Exception as exc:
                    log(f"  Error Mendeley: {exc}")

        total = copy_samples(all_pairs, output, index, args.count)

    write_readme(output, total)
    log(f"\nDone: {total} images in {output}")
    if total < args.count:
        log(f"Warning: only {total}/{args.count} collected. Check network or cache in {cache}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
