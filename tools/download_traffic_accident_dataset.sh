#!/usr/bin/env bash
# Download Roboflow dataset used to train traffic-accident-yolo11x (accident + vehicle)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/datasets/traffic-accident-yolo11x"
WORKSPACE="${ROBOFLOW_WORKSPACE:-hilmantm}"
PROJECT="${ROBOFLOW_PROJECT:-traffic-accident-detection}"
VERSION="${ROBOFLOW_VERSION:-5}"
FORMAT="${ROBOFLOW_FORMAT:-yolov11}"

if [[ -z "${ROBOFLOW_API_KEY:-}" ]]; then
  echo "❌ مطلوب ROBOFLOW_API_KEY (مجاني من https://app.roboflow.com/settings/api)"
  echo ""
  echo "   export ROBOFLOW_API_KEY='your_key'"
  echo "   ./tools/download_traffic_accident_dataset.sh"
  exit 1
fi

mkdir -p "$OUT"
TMP="$OUT/.download_tmp"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "⬇ Downloading $WORKSPACE/$PROJECT v$VERSION ($FORMAT) → $OUT"
roboflow download -k "$ROBOFLOW_API_KEY" -f "$FORMAT" -l "$TMP" "$WORKSPACE/$PROJECT/$VERSION"

# Roboflow extracts to e.g. Traffic-Accident-Detection-5/
SRC="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -1)"
if [[ -z "$SRC" || ! -f "$SRC/data.yaml" ]]; then
  echo "❌ Download finished but data.yaml not found under $TMP"
  exit 1
fi

# Flatten into OUT (keep yolo layout: train/ valid/ test/ data.yaml)
find "$OUT" -mindepth 1 -maxdepth 1 ! -name '.download_tmp' -exec rm -rf {} + 2>/dev/null || true
shopt -s dotglob
for item in "$SRC"/*; do
  base="$(basename "$item")"
  mv "$item" "$OUT/$base"
done
shopt -u dotglob
rm -rf "$TMP"

# Metadata for the project
cat > "$OUT/DATASET.md" <<EOF
# Traffic Accident Detection (YOLO)

Dataset used to fine-tune \`traffic-accident-yolo11x-epoch61\` (classes: **accident**, **vehicle**).

| Field | Value |
|-------|-------|
| Source | [Roboflow Universe](https://universe.roboflow.com/hilmantm/traffic-accident-detection) |
| Workspace | \`$WORKSPACE\` |
| Project | \`$PROJECT\` |
| Version | \`$VERSION\` |
| Format | \`$FORMAT\` |
| Model | [Enos-123/traffic-accident-detection-yolo11x](https://huggingface.co/Enos-123/traffic-accident-detection-yolo11x) |

## Train

\`\`\`bash
yolo detect train model=yolo11x.pt data=$OUT/data.yaml epochs=61 imgsz=640 batch=16
\`\`\`

## Citation

\`\`\`bibtex
@misc{ traffic-accident-detection_dataset,
  title = { Traffic Accident Detection Dataset },
  author = { hilmantm },
  howpublished = { \\url{ https://universe.roboflow.com/hilmantm/traffic-accident-detection } },
  publisher = { Roboflow Universe },
  year = { 2023 }
}
\`\`\`
EOF

echo "✅ Dataset ready: $OUT"
echo "   data.yaml: $OUT/data.yaml"
python3 - <<PY
from pathlib import Path
import yaml
p = Path("$OUT/data.yaml")
if p.exists():
    d = yaml.safe_load(p.read_text())
    names = d.get("names", d.get("nc"))
    print("   classes:", names)
    for split in ("train", "val", "valid", "test"):
        if split in d:
            print(f"   {split}:", d[split])
PY
