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


QUALITY_PRESETS = frozenset({"ultimate_accuracy", "best_accuracy", "fine_tune", "balanced"})
PRODUCTION_PRESETS = frozenset({"hostinger_production", "best_accuracy", "balanced", "ultimate_accuracy", "fine_tune"})


def is_quality_preset(config: dict) -> bool:
    preset = str(config.get("_preset") or "")
    return bool(config.get("_prioritize_accuracy")) or preset in QUALITY_PRESETS


def resolve_training_cache(config: dict, train_n: int, val_n: int) -> dict:
    """Pick RAM vs disk YOLO cache from memory budget — not a blind image-count threshold."""
    from app.core.config import get_settings

    settings = get_settings()
    budget_mb = int(settings.training_ram_cache_budget_mb or 4096)
    disk_min = int(settings.training_disk_cache_min_images or 12000)
    total_images = train_n + val_n
    imgsz = int(config.get("image_size") or 640)
    # Ultralytics RAM cache: rough ~1.2MB per image at 416, ~2.5MB at 640
    mb_per_image = 1.2 if imgsz <= 416 else (1.8 if imgsz <= 512 else 2.5)
    est_mb = total_images * mb_per_image

    use_ram = (
        hostinger_mode_enabled()
        and total_images < disk_min
        and est_mb <= budget_mb * 0.85
    )
    if use_ram:
        config["cache"] = "ram"
        config.pop("prefer_disk_cache", None)
        config["_rect"] = True
        config["_ram_cache_est_mb"] = int(est_mb)
    else:
        config["cache"] = "disk"
        config["prefer_disk_cache"] = True
        config["_rect"] = False
    return config


def _apply_hostinger_production_overlays(config: dict, train_n: int) -> dict:
    """Best CPU VPS balance: 512px, RAM cache, rect batches, val every N epochs."""
    from app.core.config import get_settings

    settings = get_settings()
    val_n = int(config.get("_val_images") or 0)
    resolve_training_cache(config, train_n, val_n)
    config["image_size"] = min(int(config.get("image_size") or 640), 512)
    mem_mb = training_mem_limit_mb()
    mem_cap = 28 if mem_mb >= 12288 else 22
    batch_floor = int(config.get("batch_size") or 12) if not isinstance(config.get("batch_size"), str) else 12
    config["batch_size"] = max(batch_floor, min(mem_cap, 32 if train_n >= 5000 else 24))
    config["_val_every"] = _resolve_val_every(settings)
    config["_large_dataset"] = True
    config["_production_cpu"] = True
    config["_image_size_locked"] = True
    if config.get("augmentation") == "none":
        config["augmentation"] = "light"
    if str(config.get("_preset") or "") == "ultimate_accuracy":
        config["image_size"] = 640
        config["_val_every"] = 2
        config["_quality_large_dataset"] = True
        config["_prioritize_accuracy"] = True
    if should_fine_tune_large(config, train_n):
        config["freeze_layers"] = min(int(config.get("freeze_layers") or 0), 6)
        config["warmup_epochs"] = min(int(config.get("warmup_epochs") or 3), 2)
        config["close_mosaic"] = min(int(config.get("close_mosaic") or 5), 3)
    return config


def _apply_large_dataset_quality(config: dict, train_n: int) -> dict:
    """Ultimate accuracy on large data — only when user explicitly opts in."""
    preset = str(config.get("_preset") or "")
    val_n = int(config.get("_val_images") or 0)
    if preset == "ultimate_accuracy" and hostinger_mode_enabled():
        config = _apply_hostinger_production_overlays(config, train_n)
        config["image_size"] = 640
        config["_val_every"] = 2
        config["_quality_large_dataset"] = True
        config["_prioritize_accuracy"] = True
        return config

    from app.core.config import get_settings

    settings = get_settings()
    val_every = 2
    mem_cap = 24 if training_mem_limit_mb() >= 12288 else 16
    batch_floor = int(config.get("batch_size") or 8)
    if isinstance(batch_floor, str):
        batch_floor = 12
    resolve_training_cache(config, train_n, val_n)
    config["image_size"] = max(int(config.get("image_size") or 640), 512)
    config["batch_size"] = max(batch_floor, min(mem_cap, 20 if train_n >= 5000 else 16))
    config["_val_every"] = val_every
    config["_large_dataset"] = True
    config["_prioritize_accuracy"] = True
    config["_image_size_locked"] = True
    config["_quality_large_dataset"] = True
    return config


def _apply_large_dataset_speed(config: dict, train_n: int) -> dict:
    """Large dataset + fast presets: smaller imgsz, larger batch, less validation."""
    mem_mb = training_mem_limit_mb()
    if train_n >= 5000:
        cap_imgsz = 416
        val_every = 5
        batch_target = 40
    else:
        cap_imgsz = 416
        val_every = 4
        batch_target = 36

    mem_cap = 48 if mem_mb >= 12288 else 40
    config["image_size"] = min(int(config.get("image_size") or 640), cap_imgsz)
    config["batch_size"] = max(int(config.get("batch_size") or 16), min(mem_cap, batch_target))
    config["cache"] = "disk"
    config["prefer_disk_cache"] = True
    config["_rect"] = False
    config["_val_every"] = max(int(config.get("_val_every") or 1), val_every)
    config["_fast_aug"] = True
    config["_large_dataset"] = True
    config["_image_size_locked"] = True

    if config.get("augmentation") in ("medium", "heavy"):
        config["augmentation"] = "light"

    if should_fine_tune_large(config, train_n):
        config["freeze_layers"] = min(int(config.get("freeze_layers") or 0), 3)
        config["warmup_epochs"] = 1
        config["close_mosaic"] = 2
        config["patience"] = min(int(config.get("patience") or 10), 8)

    epochs = int(config.get("epochs") or 20)
    if train_n >= 5000 and epochs > 30:
        config["_epochs_capped_from"] = epochs
        config["epochs"] = 30

    return config


def apply_large_dataset_overlays(config: dict) -> dict:
    """After export — tune large CPU datasets for production, quality, or speed."""
    train_n = int(config.get("_train_images") or config.get("_labeled_train_images") or 0)
    if train_n < 2500:
        resolve_training_cache(config, train_n, int(config.get("_val_images") or 0))
        return config
    preset = str(config.get("_preset") or "")
    if hostinger_mode_enabled() and preset in PRODUCTION_PRESETS:
        return _apply_hostinger_production_overlays(config, train_n)
    if is_quality_preset(config):
        return _apply_large_dataset_quality(config, train_n)
    return _apply_large_dataset_speed(config, train_n)


def should_fine_tune_large(config: dict, train_n: int) -> bool:
    from app.services.training.fine_tune import should_fine_tune

    return train_n >= 5000 and should_fine_tune(config)


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
    if config.get("_production_cpu"):
        parts.append(f"production-{config.get('_train_images', '?')}")
    elif config.get("_quality_large_dataset"):
        parts.append(f"quality-{config.get('_train_images', '?')}")
    elif config.get("_large_dataset"):
        parts.append(f"large-{config.get('_train_images', '?')}")
    if use_ram_workspace():
        parts.append("shm")
    return "Speed boost: " + " · ".join(parts)


def use_ram_workspace() -> bool:
    from app.services.training.workspace import use_ram_workspace as _use

    return _use()
