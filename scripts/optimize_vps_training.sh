#!/usr/bin/env bash
# Apply maximum CPU training performance on VPS (same preset/epochs in UI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${1:-.env}"

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

CORES="$(nproc 2>/dev/null || echo 4)"

echo "=== VPS training optimization ==="
echo "Detected CPU cores: $CORES"

set_kv TRAINING_SPEED_BOOST true
if (( CORES <= 8 )); then
  set_kv TRAINING_HOSTINGER_MODE true
  set_kv TRAINING_VAL_EVERY 4
  set_kv TRAINING_SHM_SIZE 4g
  set_kv TRAINING_TMPFS_SIZE 3g
fi
set_kv TRAINING_AUTO_BATCH true
set_kv TRAINING_CPU_THREADS "$CORES"
set_kv TRAINING_CPU_LIMIT "$CORES"
set_kv TRAINING_CPU_FALLBACK true
set_kv TRAINING_SKIP_ONNX_EXPORT true
set_kv TRAINING_EXPORT_MAX_WORKERS 0
set_kv CELERY_GENERAL_CONCURRENCY 1

if ! grep -q "^TRAINING_MEM_LIMIT=" "$ENV_FILE" 2>/dev/null; then
  set_kv TRAINING_MEM_LIMIT 12288m
fi

echo ""
echo "Updated $ENV_FILE"
grep -E '^TRAINING_|^CELERY_GENERAL' "$ENV_FILE" || true

echo ""
echo "Rebuilding training worker..."
docker compose -f docker-compose.prod.yml build worker-training
docker compose -f docker-compose.prod.yml up -d worker-training gateway

echo ""
echo "Done. Stop current training and start a new job to apply runtime tuning."
