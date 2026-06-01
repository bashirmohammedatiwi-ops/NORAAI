"""CPU training presets — tuned for VPS without GPU."""

CPU_PRESETS: dict[str, dict] = {
    "turbo_cpu": {
        "label": "Turbo CPU",
        "description": "5 epochs · 320px · minimal aug — fastest run for quick tests",
        "epochs": 5,
        "batch_size": 16,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "augmentation": "none",
        "image_size": 320,
        "mixed_precision": False,
        "val_split": 0.15,
        "cache": True,
        "patience": 3,
        "close_mosaic": 2,
        "device": "cpu",
    },
    "fast_cpu": {
        "label": "Fast CPU",
        "description": "8 epochs · 416px · light augmentation — recommended on CPU VPS",
        "epochs": 8,
        "batch_size": 12,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "augmentation": "light",
        "image_size": 416,
        "mixed_precision": False,
        "val_split": 0.2,
        "cache": True,
        "patience": 5,
        "close_mosaic": 3,
        "device": "cpu",
    },
    "balanced": {
        "label": "Balanced CPU",
        "description": "15 epochs · 640px · medium augmentation — better accuracy, slower",
        "epochs": 15,
        "batch_size": 8,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "augmentation": "medium",
        "image_size": 640,
        "mixed_precision": False,
        "val_split": 0.2,
        "cache": True,
        "patience": 8,
        "device": "cpu",
    },
}

DEFAULT_CPU_PRESET = "fast_cpu"


def build_retrain_config(epochs: int | None, preset: str = DEFAULT_CPU_PRESET) -> dict:
    base = dict(CPU_PRESETS.get(preset, CPU_PRESETS[DEFAULT_CPU_PRESET]))
    if epochs is not None:
        base["epochs"] = epochs
    base["continuous"] = True
    return base
