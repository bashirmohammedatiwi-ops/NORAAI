"""Auto-tune YOLO CPU training to saturate all available cores."""

from __future__ import annotations

import os


def cpu_count() -> int:
    return max(1, int(os.cpu_count() or 4))


def effective_cpu_count() -> int:
    """Host core count for tuning — TRAINING_CPU_THREADS overrides cgroup-limited detection."""
    from app.core.config import get_settings

    detected = cpu_count()
    override = get_settings().training_cpu_threads
    if override and override > 0:
        return max(detected, override)
    return detected


def apply_cpu_env(thread_count: int | None = None) -> int:
    """Set BLAS / PyTorch thread env before training (call once per job)."""
    n = thread_count or effective_cpu_count()
    for key in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
        "NUMEXPR_NUM_THREADS",
        "TORCH_NUM_THREADS",
    ):
        os.environ[key] = str(n)
    try:
        import torch

        torch.set_num_threads(n)
        if hasattr(torch, "set_num_interop_threads"):
            torch.set_num_interop_threads(max(2, n // 2))
    except Exception:
        pass
    return n


def resolve_thread_count(explicit: int | None = None) -> int:
    if explicit and explicit > 0:
        return explicit
    return effective_cpu_count()


def tune_training_config(config: dict, *, export_workers: int = 0) -> dict:
    """Scale batch size and dataloader workers from host CPU count."""
    from app.core.config import get_settings

    settings = get_settings()
    n = effective_cpu_count()
    threads = resolve_thread_count()
    apply_cpu_env(threads)
    out = dict(config)

    workers = out.get("workers")
    if workers in (None, 0, "auto"):
        out["workers"] = max(2, n - 1)

    out["cpu_threads"] = threads
    out["batch_size"] = _resolve_batch(out.get("batch_size"), n, settings.training_auto_batch)

    if out.pop("prefer_disk_cache", False):
        out["cache"] = "disk"
    out["_export_workers"] = export_workers or settings.training_export_max_workers or min(32, n * 3)

    return out


def _resolve_batch(batch: object, cpu_n: int, auto: bool) -> int:
    if batch in (None, 0, "auto"):
        # Larger batches keep CPU matrix units busier (tune by core count).
        return min(32, max(8, cpu_n * 3))
    base = int(batch)
    if not auto:
        return base
    return min(32, max(base, cpu_n * 2))
