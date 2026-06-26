#!/usr/bin/env python3
"""Convert Roboflow/Ultralytics ONNX (YOLOv8 raw head) to a Studio-compatible .pt file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import onnx2torch
import torch


def convert(onnx_path: Path, *, sidecar: Path | None = None, out_path: Path | None = None) -> Path:
    onnx_path = onnx_path.resolve()
    if not onnx_path.is_file():
        raise FileNotFoundError(onnx_path)

    cfg: dict = {"classes": [], "image_size": 640, "resize_mode": "stretch"}
    sidecar_path = sidecar or onnx_path.with_suffix(".classes.json")
    if sidecar_path.is_file():
        cfg.update(json.loads(sidecar_path.read_text(encoding="utf-8")))

    classes = [str(c) for c in cfg.get("classes") or []]
    if not classes:
        raise ValueError(f"No classes in {sidecar_path}")

    pt_path = out_path or onnx_path.with_suffix(".pt")
    print(f"[convert] ONNX → PT\n  in:  {onnx_path}\n  out: {pt_path}")

    torch_model = onnx2torch.convert(str(onnx_path))
    torch_model.eval()

    ckpt = {
        "format": "onnx2torch",
        "model": torch_model,
        "names": {i: c for i, c in enumerate(classes)},
        "nc": len(classes),
        "task": "detect",
        "imgsz": int(cfg.get("image_size") or 640),
        "resize_mode": str(cfg.get("resize_mode") or "stretch").lower(),
        "onnx_source": str(onnx_path),
        "version": "nurai-onnx2pt/1",
    }
    torch.save(ckpt, pt_path)
    size_mb = pt_path.stat().st_size / (1024 * 1024)
    print(f"[convert] ✓ saved {pt_path.name} ({size_mb:.1f} MB) — {len(classes)} classes")
    return pt_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert YOLO ONNX to Studio PT (onnx2torch)")
    parser.add_argument("onnx", type=Path, help="Path to .onnx file")
    parser.add_argument("--sidecar", type=Path, help="Optional .classes.json")
    parser.add_argument("--out", type=Path, help="Output .pt path")
    args = parser.parse_args()
    convert(args.onnx, sidecar=args.sidecar, out_path=args.out)


if __name__ == "__main__":
    main()
