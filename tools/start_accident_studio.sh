#!/usr/bin/env bash
# NURAI Vision Studio — defaults to VPS mobile Main Model (same as phone app)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS_DIR="$ROOT/models/pretrained"
MAIN_MODEL="$ROOT/models/pretrained/mobile/main-model.onnx"
RASID_MODEL="$ROOT/models/pretrained/mobile/rasid-drive.onnx"

if [[ -n "${1:-}" ]]; then
  AUTO_MODEL="$1"
elif [[ -f "$MAIN_MODEL" ]]; then
  AUTO_MODEL="$MAIN_MODEL"
elif [[ -f "$RASID_MODEL" ]]; then
  AUTO_MODEL="$RASID_MODEL"
else
  AUTO_MODEL=""
fi

echo "▶ NURAI Vision Studio → http://127.0.0.1:8765/"
echo "   Models: $MODELS_DIR"
echo "   Default: $(basename "$AUTO_MODEL") — mobile-deployed ONNX"

ARGS=(--port 8765 --models-dir "$MODELS_DIR")
if [[ -n "$AUTO_MODEL" ]]; then
  ARGS+=(--model "$AUTO_MODEL")
fi

exec python3 "$ROOT/tools/onnx_video_studio.py" "${ARGS[@]}"
