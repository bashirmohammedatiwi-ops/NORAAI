# Incremental YOLO11 Training (Same Model File)

Train a **single** `model.pt` across multiple sessions. Each session loads the current weights, fine-tunes on new data, backs up the old file, then **overwrites** `model.pt`.

## Files

| File | Purpose |
|------|---------|
| `train_config.yaml` | Model path, classes, session history, hyperparameters |
| `train_pipeline.py` | Training logic (Ultralytics Python API) |
| `models/model.pt` | Your living model (created session 1, updated session 2+) |
| `models/backups/` | Timestamped backups before each overwrite |
| `models/model_meta.json` | JSON mirror of sessions + latest metrics |

## Setup

```bash
cd scripts/incremental_training
pip install ultralytics pyyaml
```

Edit `train_config.yaml`:

```yaml
model_path: models/model.pt
base_weights: yolo11n.pt
classes:
  - pothole
```

## Usage

### Session 1 — potholes (from pretrained YOLO11n)

```bash
python train_pipeline.py \
  --data /path/to/potholes/data.yaml \
  --epochs 50 \
  --note "Initial pothole training"
```

- Loads `yolo11n.pt`
- Saves to `models/model.pt`
- `lr0=0.01`, `freeze=0`

### Session 2 — add accidents (same model file)

```bash
python train_pipeline.py \
  --data /path/to/accidents/data.yaml \
  --epochs 30 \
  --note "Added accident class"
```

- Backs up `models/model.pt` → `models/backups/model_YYYYMMDD_HHMMSS.pt`
- Loads `models/model.pt`
- Fine-tunes with `lr0=0.0001`, `freeze=10`
- **Overwrites** `models/model.pt`

### Session 3 — more data

```bash
python train_pipeline.py \
  --data /path/to/combined/data.yaml \
  --epochs 20
```

Same flow: backup → train → overwrite `model.pt`.

## Dataset yaml requirements

Your `data.yaml` must follow Ultralytics format:

```yaml
path: /absolute/path/to/dataset
train: images/train
val: images/val
nc: 2
names:
  - pothole
  - accident
```

**Class expansion:** If session 2 adds new classes, list them in that session's yaml. The pipeline merges names into `train_config.yaml` cumulatively and writes a temporary `cumulative_data.yaml` for training.

## Python API

```python
from train_pipeline import train_incremental

summary = train_incremental(
    new_data="datasets/accidents/data.yaml",
    epochs=30,
    freeze_layers=10,  # optional override
    session_note="Added accidents",
)
print(summary["metrics"])
```

## Session history

After each run, `train_config.yaml` is updated:

```yaml
sessions:
  - session: 1
    timestamp: "2026-06-08T12:00:00+00:00"
    dataset: /path/to/potholes/data.yaml
    epochs: 50
    classes: [pothole]
    metrics:
      map50_95: 0.72
  - session: 2
    timestamp: "2026-06-08T14:00:00+00:00"
    dataset: /path/to/accidents/data.yaml
    epochs: 30
    classes: [pothole, accident]
    backup: models/backups/model_20260608_140000.pt
```

## Preventing catastrophic forgetting

| Setting | First session | Fine-tune sessions |
|---------|---------------|-------------------|
| `lr0` | `0.01` | `0.0001` |
| `freeze` | `0` | `10` (backbone frozen) |
| `warmup_epochs` | — | `3` |
| `close_mosaic` | — | `5` |

Adjust in `train_config.yaml` under `first_session` and `fine_tune`.

## Restore from backup

```bash
cp models/backups/model_20260608_140000.pt models/model.pt
```

## Integration with NORAAI platform

The web UI "تقوية الموديل" flow does similar fine-tuning inside Docker/MinIO. Use this standalone pipeline when training **outside** the platform (local PC, custom datasets) and you want a single `.pt` file on disk.
