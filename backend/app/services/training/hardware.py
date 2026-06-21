"""Detect best training/inference device on Windows (CPU, CUDA, Intel iGPU via DirectML)."""

from __future__ import annotations

import os
import platform
from functools import lru_cache
from typing import Any


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


@lru_cache
def directml_available() -> bool:
    if platform.system() != "Windows":
        return False
    try:
        import torch_directml  # noqa: F401

        return True
    except Exception:
        return False


def directml_device() -> Any | None:
    if not directml_available():
        return None
    import torch_directml

    return torch_directml.device()


def detect_hardware() -> dict[str, Any]:
    """Summary for API / desktop launcher UI."""
    cpu_n = cpu_logical_count()
    has_cuda = cuda_available()
    has_dml = directml_available()
    has_mps = mps_available()
    best = pick_device("auto", force_cpu=False)
    label = device_label(best)
    return {
        "cpu_threads": cpu_n,
        "cuda_available": has_cuda,
        "directml_available": has_dml,
        "mps_available": has_mps,
        "platform": platform.system(),
        "processor": platform.processor() or "unknown",
        "best_device": normalize_device_name(best),
        "best_device_label": label,
    }


def normalize_device_name(device: Any) -> str:
    if device == "cpu":
        return "cpu"
    if device == "directml" or _is_directml_device(device):
        return "directml"
    if device == "mps":
        return "mps"
    if isinstance(device, int) or (isinstance(device, str) and device.isdigit()):
        return "cuda"
    return str(device)


def device_label(device: Any) -> str:
    name = normalize_device_name(device)
    if name == "cpu":
        return f"CPU Training ({cpu_logical_count()} threads)"
    if name == "directml":
        return "Intel GPU (DirectML)"
    if name == "cuda":
        return "NVIDIA GPU (CUDA)"
    if name == "mps":
        return "Apple GPU (MPS)"
    return str(device)


def _is_directml_device(device: Any) -> bool:
    try:
        return "privateuseone" in str(device).lower() or "directml" in type(device).__module__.lower()
    except Exception:
        return False


def pick_device(requested: str = "auto", *, force_cpu: bool = False) -> Any:
    """
    Resolve device for Ultralytics / PyTorch.

    Priority when auto: CUDA:0 > MPS (Apple) > DirectML (Intel iGPU) > CPU.
    """
    req = (requested or "auto").strip().lower()
    if force_cpu or req == "cpu":
        return "cpu"
    if req == "cuda" or req == "gpu" or req == "0":
        if cuda_available():
            return 0
        if mps_available():
            return "mps"
        if directml_available():
            return "directml"
        return "cpu"
    if req == "mps":
        return "mps" if mps_available() else "cpu"
    if req == "directml" or req == "igpu":
        if directml_available():
            return "directml"
        return "cpu"
    if req == "auto":
        if cuda_available():
            return 0
        if mps_available():
            return "mps"
        if directml_available():
            return "directml"
        return "cpu"
    if cuda_available() and req.isdigit():
        return int(req)
    return "cpu"


def resolve_training_device_value(config: dict[str, Any], settings: Any) -> Any:
    """Apply env + job config to pick training device."""
    requested = config.get("device") or getattr(settings, "training_device", "auto")
    if getattr(settings, "training_cpu_fallback", False):
        return "cpu"
    return pick_device(str(requested), force_cpu=False)


def resolve_inference_device_value(settings: Any) -> Any:
    requested = getattr(settings, "inference_device", "auto")
    return pick_device(str(requested), force_cpu=False)


def ultralytics_device(device: Any) -> Any:
    """Convert logical device to Ultralytics-compatible value."""
    if device == "directml":
        dml = directml_device()
        return dml if dml is not None else "cpu"
    return device


def is_cpu_device(device: Any) -> bool:
    name = normalize_device_name(device)
    return name == "cpu"


def is_mps_device(device: Any) -> bool:
    return normalize_device_name(device) == "mps"
