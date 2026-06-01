"""CPU training presets — tuned for VPS without GPU."""

CPU_PRESETS: dict[str, dict] = {
    "fast_cpu": {
        "label": "Fast CPU",
        "description": "10 epochs · 416px · light augmentation — fastest practical run",
        "epochs": 10,
        "batch_size": 8,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "augmentation": "light",
        "image_size": 416,
        "mixed_precision": False,
        "val_split": 0.2,
        "cache": True,
        "device": "cpu",
    },
    "balanced": {
        "label": "Balanced CPU",
        "description": "20 epochs · 640px · medium augmentation — better accuracy, slower",
        "epochs": 20,
        "batch_size": 8,
        "learning_rate": 0.01,
        "optimizer": "AdamW",
        "scheduler": "cosine",
        "augmentation": "medium",
        "image_size": 640,
        "mixed_precision": False,
        "val_split": 0.2,
        "cache": True,
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
