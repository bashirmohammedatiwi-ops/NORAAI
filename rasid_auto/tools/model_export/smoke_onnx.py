#!/usr/bin/env python3
"""Quick ONNX Runtime smoke test for the exported U-Net."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--onnx",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "assets"
        / "models"
        / "model.onnx",
    )
    args = ap.parse_args()
    sess = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    print("in ", inp.name, inp.shape, inp.type)
    print("out", out.name, out.shape, out.type)
    x = np.random.rand(1, 256, 256, 3).astype("float32")
    y = sess.run(None, {inp.name: x})[0]
    print("run", y.shape, "min", float(y.min()), "max", float(y.max()))
    assert list(y.shape) == [1, 256, 256, 2], y.shape
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
