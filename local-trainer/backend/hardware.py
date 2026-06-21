"""Device detection for local training (CPU / CUDA / Apple MPS)."""

from __future__ import annotations

import os
import platform
from functools import lru_cache


@lru_cache
def cpu_logical_count() -> int:
    return max(1, int(os.cpu_count() or 4))


@lru_cache
def cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


@lru_cache
def mps_available() -> bool:
    try:
        import torch

        return bool(torch.backends.mps.is_available())
    except Exception:
        return False


def pick_device(requested: str = "auto") -> str:
    req = (requested or "auto").strip().lower()
    if req == "cpu":
        return "cpu"
    if req in ("cuda", "gpu", "0"):
        if cuda_available():
            return "0"
        if mps_available():
            return "mps"
        return "cpu"
    if req == "mps":
        return "mps" if mps_available() else "cpu"
    if req == "auto":
        if cuda_available():
            return "0"
        if mps_available():
            return "mps"
        return "cpu"
    return "cpu"


def device_label(device: str) -> str:
    if device == "cpu":
        return f"CPU ({cpu_logical_count()} threads)"
    if device == "mps":
        return "Apple GPU (MPS)"
    if device in ("0", "cuda"):
        return "NVIDIA GPU (CUDA)"
    return str(device)


def detect_hardware() -> dict:
    dev = pick_device("auto")
    return {
        "platform": platform.system(),
        "processor": platform.processor() or "unknown",
        "cpu_threads": cpu_logical_count(),
        "cuda_available": cuda_available(),
        "mps_available": mps_available(),
        "best_device": dev,
        "best_device_label": device_label(dev),
    }
