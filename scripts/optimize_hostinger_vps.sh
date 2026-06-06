#!/usr/bin/env bash
# Hostinger KVM VPS — 4 vCPU / ~15 GB RAM, no GPU.
# Maximizes YOLO CPU throughput: RAM cache, /dev/shm workspace, lite augmentations, val every 4 epochs.
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
RAM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 15360)"
TRAIN_MEM_MB=$((RAM_MB * 80 / 100))
if (( TRAIN_MEM_MB > 12288 )); then
  TRAIN_MEM_MB=12288
elif (( TRAIN_MEM_MB < 8192 )); then
  TRAIN_MEM_MB=8192
fi

echo "=== Hostinger VPS training optimization ==="
echo "CPU cores: $CORES · host RAM: ${RAM_MB} MB · worker mem_limit: ${TRAIN_MEM_MB}m"

set_kv TRAINING_HOSTINGER_MODE true
set_kv TRAINING_SPEED_BOOST true
set_kv TRAINING_AUTO_BATCH true
set_kv TRAINING_CPU_THREADS "$CORES"
set_kv TRAINING_CPU_LIMIT "$CORES"
set_kv TRAINING_CPU_FALLBACK true
set_kv TRAINING_SKIP_ONNX_EXPORT true
set_kv TRAINING_EXPORT_MAX_WORKERS 0
set_kv TRAINING_EXPORT_CACHE_ENABLED true
set_kv TRAINING_RAM_CACHE_BUDGET_MB 4096
set_kv TRAINING_DISK_CACHE_MIN_IMAGES 12000
set_kv TRAINING_VAL_EVERY 4
set_kv TRAINING_MEM_LIMIT "${TRAIN_MEM_MB}m"
set_kv TRAINING_SHM_SIZE 4g
set_kv TRAINING_TMPFS_SIZE 3g
set_kv CELERY_GENERAL_CONCURRENCY 1
set_kv API_UVICORN_WORKERS 1

if command -v sysctl >/dev/null 2>&1; then
  echo ""
  echo "Kernel tuning (requires root for persistent sysctl)..."
  sudo sysctl -w vm.swappiness=10 2>/dev/null || sysctl -w vm.swappiness=10 2>/dev/null || true
  sudo sysctl -w vm.dirty_ratio=15 2>/dev/null || true
  sudo sysctl -w vm.dirty_background_ratio=5 2>/dev/null || true
fi

echo ""
echo "Updated $ENV_FILE:"
grep -E '^TRAINING_|^CELERY_GENERAL|^API_UVICORN' "$ENV_FILE" || true

echo ""
echo "Rebuilding training worker (shm + tmpfs)..."
docker compose -f docker-compose.prod.yml build worker-training
docker compose -f docker-compose.prod.yml up -d worker-training gateway

echo ""
echo "Done."
echo "  • Stop the current training job and start a NEW one (old jobs keep old settings)."
echo "  • Use preset turbo_cpu or max_cpu for ~5–12 min/epoch; 150 epochs at 640px ≈ 15–25 min/epoch on 4 cores."
echo "  • Setup message should show: hostinger · shm · lite-aug · val/4ep"
