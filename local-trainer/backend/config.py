from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CLASSES_FILE = DATA_DIR / "classes.json"
DATASETS_DIR = DATA_DIR / "datasets"
MODELS_DIR = DATA_DIR / "models"
ACTIVE_DATASET_FILE = DATA_DIR / "active_dataset.json"

for d in (DATA_DIR, DATASETS_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)
