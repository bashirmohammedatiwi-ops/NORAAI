#!/bin/bash
# Reclaim Docker disk space on VPS (safe by default).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DELETE_VOLUMES=0
PRUNE_ALL_IMAGES=0

for arg in "$@"; do
  case "$arg" in
    --volumes) DELETE_VOLUMES=1 ;;
    --all-images) PRUNE_ALL_IMAGES=1 ;;
    -h|--help)
      echo "Usage: $0 [--all-images] [--volumes]"
      echo "  default      Remove build cache, stopped containers, dangling images"
      echo "  --all-images Also remove unused images not referenced by running containers"
      echo "  --volumes    Stop stack and delete ALL aiops volumes (DATA LOSS)"
      exit 0
      ;;
  esac
done

echo "=== Before cleanup ==="
df -h / | tail -1
docker system df

if [ "$DELETE_VOLUMES" -eq 1 ]; then
  echo ""
  echo "WARNING: This deletes ALL datasets, images, models, and database data."
  echo "Stopping stack and removing volumes in 5 seconds... Ctrl+C to cancel."
  sleep 5
  docker compose -f "$COMPOSE_FILE" down -v
  echo "Volumes removed."
else
  echo ""
  echo "Removing build cache..."
  docker builder prune -f 2>/dev/null || true

  echo "Removing stopped containers..."
  docker container prune -f

  echo "Removing dangling images..."
  docker image prune -f

  if [ "$PRUNE_ALL_IMAGES" -eq 1 ]; then
    echo "Removing unused images (keeps images used by running containers)..."
    docker image prune -a -f
  fi
fi

echo ""
echo "=== After cleanup ==="
df -h / | tail -1
docker system df

echo ""
echo "Done. Run ./scripts/disk_usage.sh for a detailed breakdown."
