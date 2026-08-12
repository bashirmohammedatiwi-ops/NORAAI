#!/usr/bin/env python3
"""Convert lilNewbie U-Net.h5 → ONNX (+ TFLite) for RASID Auto.

Source: https://github.com/lilNewbie/SemanticSegmentation
Input:  NHWC (1,256,256,3) float32 /255
Output: NHWC (1,256,256,2) — channel1 = pothole
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def _patch_keras():
    from tensorflow import keras

    for name in ("Conv2D", "Conv2DTranspose", "DepthwiseConv2D"):
        cls = getattr(keras.layers, name, None)
        if cls is None:
            continue
        orig = cls.from_config

        @classmethod
        def patched(cls, config, _orig=orig):  # noqa: B902
            cfg = dict(config)
            cfg.pop("groups", None)
            return _orig.__func__(cls, cfg)

        cls.from_config = patched


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--h5", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--imgsz", type=int, default=256)
    args = ap.parse_args()

    import numpy as np
    import tensorflow as tf
    from tensorflow import keras

    _patch_keras()
    print("TF", tf.__version__)
    model = keras.models.load_model(args.h5, compile=False)
    print("in", model.input_shape, "out", model.output_shape)

    imgsz = args.imgsz
    spec = tf.TensorSpec([1, imgsz, imgsz, 3], tf.float32, name="input")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    import tf2onnx

    onnx_path = args.out_dir / "model.onnx"
    tf2onnx.convert.from_keras(
        model,
        input_signature=[spec],
        opset=13,
        output_path=str(onnx_path),
    )
    print("ONNX", onnx_path, onnx_path.stat().st_size)

    x = np.random.rand(1, imgsz, imgsz, 3).astype("float32")
    y = model.predict(x, verbose=0)
    out_shape = list(y.shape)
    nc = int(out_shape[-1])

    manifest = {
        "name": "RASID U-Net Pothole (lilNewbie)",
        "version": "1.0.0",
        "task": "segmentation",
        "format": "onnx",
        "backend": "onnxruntime",
        "source": "https://github.com/lilNewbie/SemanticSegmentation",
        "image_size": imgsz,
        "input_size": imgsz,
        "resize_mode": "stretch",
        "normalize": "div255",
        "layout": "NHWC",
        "classes": ["background", "pothole"],
        "class_ids": {"background": 0, "pothole": 1},
        "pothole_channel": 1,
        "input": {
            "name": "input",
            "shape": [1, imgsz, imgsz, 3],
            "dtype": "float32",
            "layout": "NHWC",
            "normalize": "div255",
        },
        "output": {
            "shape": out_shape,
            "dtype": "float32",
            "description": "NHWC softmax/logits; channel 1 = pothole",
        },
        "speed_bump_supported": False,
        "recommended_threshold": 0.45,
        "nc": nc,
    }
    (args.out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    # TFLite export is optional; Keras 3 + TF 2.16 often crashes on this graph.
    if os.environ.get("RASID_EXPORT_TFLITE") == "1":
        try:
            converter = tf.lite.TFLiteConverter.from_keras_model(model)
            tflite_path = args.out_dir / "model.tflite"
            tflite_path.write_bytes(converter.convert())
            print("TFLite", tflite_path, tflite_path.stat().st_size)
        except Exception as e:
            print("TFLite skipped:", e)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
