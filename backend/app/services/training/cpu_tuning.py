"""Auto-tune YOLO CPU training — optimized for Hostinger KVM VPS (4 vCPU, no GPU)."""

from __future__ import annotations

import os
import re
import sys


def cpu_count() -> int:
    return max(1, int(os.cpu_count() or 4))


def effective_cpu_count() -> int:
    from app.core.config import get_settings

    detected = cpu_count()
    override = get_settings().training_cpu_threads
    if override and override > 0:
        return max(detected, override)
    return detected


def speed_boost_enabled() -> bool:
    from app.core.config import get_settings

    return bool(get_settings().training_speed_boost)


def hostinger_mode_enabled() -> bool:
    from app.core.config import get_settings

    s = get_settings()
    return bool(s.training_hostinger_mode or (s.training_speed_boost and effective_cpu_count() <= 8))


def training_mem_limit_mb() -> int:
    raw = os.environ.get("TRAINING_MEM_LIMIT", "")
    if not raw:
        return 0
    m = re.match(r"^(\d+)\s*([mMgG])?$", str(raw).strip())
    if not m:
        return 0
    value = int(m.group(1))
    unit = (m.group(2) or "m").lower()
    return value * 1024 if unit == "g" else value


def apply_cpu_env(thread_count: int | None = None) -> int:
    n = thread_count or effective_cpu_count()
    boost = speed_boost_enabled()
    hostinger = hostinger_mode_enabled()
    interop = 1 if (boost or hostinger) and n <= 8 else max(2, n // 2)

    if boost or hostinger:
        os.environ.setdefault("OMP_WAIT_POLICY", "ACTIVE")
        os.environ.setdefault("KMP_BLOCKTIME", "0")
        os.environ.setdefault("KMP_AFFINITY", "granularity=fine,compact,1,0")
        os.environ.setdefault("MALLOC_ARENA_MAX", "2")

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
            torch.set_num_interop_threads(interop)
        if hasattr(torch.backends, "mkldnn"):
            torch.backends.mkldnn.enabled = True
        if hasattr(torch, "set_float32_matmul_precision"):
            torch.set_float32_matmul_precision("high")
    except Exception:
        pass
    return n


def resolve_thread_count(explicit: int | None = None) -> int:
    if explicit and explicit > 0:
        return explicit
    return effective_cpu_count()


def _resolve_val_every(settings) -> int:
    if settings.training_val_every and settings.training_val_every > 0:
        return int(settings.training_val_every)
    if hostinger_mode_enabled():
        return 4
    if speed_boost_enabled():
        return 2
    return 1


def _resolve_dataloader_workers(n: int, workers: object, *, aggressive: bool) -> int:
    if workers not in (None, 0, "auto"):
        return int(workers)
    if aggressive or n <= 8:
        return 0
    return max(2, n - 1)


def _resolve_batch(batch: object, cpu_n: int, auto: bool, *, aggressive: bool, mem_mb: int) -> int:
    mem_cap = 64
    if hostinger_mode_enabled() and mem_mb >= 8192:
        mem_cap = 36
    elif mem_mb >= 12288:
        mem_cap = 32
    elif mem_mb >= 8192:
        mem_cap = 24
    elif mem_mb >= 4096:
        mem_cap = 16

    if batch in (None, 0, "auto"):
        if aggressive:
            return min(mem_cap, max(20, cpu_n * 6))
        return min(32, max(8, cpu_n * 3))

    base = int(batch)
    if not auto:
        if aggressive:
            return min(mem_cap, max(base, cpu_n * 5))
        return base

    scaled = min(32, max(base, cpu_n * 2))
    if aggressive:
        return min(mem_cap, max(scaled, cpu_n * 5))
    return scaled


def _resolve_cache(out: dict, *, aggressive: bool, mem_mb: int) -> None:
    prefer_disk = out.pop("prefer_disk_cache", False)
    if not aggressive:
        if prefer_disk:
            out["cache"] = "disk"
        return

    if mem_mb >= 8192 or hostinger_mode_enabled():
        out["cache"] = "ram"
    elif prefer_disk or out.get("cache") is True:
        out["cache"] = "disk"


def _apply_speed_overlays(out: dict, *, settings) -> None:
    if int(out.get("warmup_epochs") or 0) > 1:
        out["warmup_epochs"] = 1 if hostinger_mode_enabled() else 2
    if int(out.get("close_mosaic") or 0) > 2:
        out["close_mosaic"] = 2 if hostinger_mode_enabled() else 3
    out["_val_every"] = _resolve_val_every(settings)
    out["_rect"] = True
    if hostinger_mode_enabled():
        out["_fast_aug"] = True
        out["_hostinger"] = True


def tune_training_config(config: dict, *, export_workers: int = 0) -> dict:
    from app.core.config import get_settings

    settings = get_settings()
    n = effective_cpu_count()
    aggressive = speed_boost_enabled() or hostinger_mode_enabled()
    mem_mb = training_mem_limit_mb()
    threads = resolve_thread_count()
    apply_cpu_env(threads)
    out = dict(config)

    out["workers"] = _resolve_dataloader_workers(n, out.get("workers"), aggressive=aggressive)
    out["cpu_threads"] = threads
    out["batch_size"] = _resolve_batch(
        out.get("batch_size"),
        n,
        settings.training_auto_batch,
        aggressive=aggressive,
        mem_mb=mem_mb,
    )

    if aggressive:
        out["_speed_boost"] = True
        _apply_speed_overlays(out, settings=settings)

    _resolve_cache(out, aggressive=aggressive, mem_mb=mem_mb)

    max_export = min(32, n * 3)
    if sys.platform == "win32":
        max_export = min(max_export, 12)
    elif hostinger_mode_enabled():
        max_export = min(32, max(16, n * 4))
    elif aggressive:
        max_export = min(24, max(12, n * 3))
    out["_export_workers"] = export_workers or settings.training_export_max_workers or max_export

    return out


def speed_boost_summary(config: dict) -> str:
    if not config.get("_speed_boost"):
        return ""
    cache = config.get("cache", "?")
    parts = [
        f"{config.get('cpu_threads')} threads",
        f"batch {config.get('batch_size')}",
        f"workers {config.get('workers')}",
        f"cache {cache}",
    ]
    if config.get("_rect"):
        parts.append("rect")
    if int(config.get("_val_every") or 1) > 1:
        parts.append(f"val/{config['_val_every']}ep")
    if config.get("_fast_aug"):
        parts.append("lite-aug")
    if config.get("_hostinger"):
        parts.append("hostinger")
    if use_ram_workspace():
        parts.append("shm")
    return "Speed boost: " + " · ".join(parts)


def use_ram_workspace() -> bool:
    from app.services.training.workspace import use_ram_workspace as _use

    return _use()
