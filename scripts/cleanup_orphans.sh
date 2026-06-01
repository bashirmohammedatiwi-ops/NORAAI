#!/bin/bash
# Remove legacy duplicate workers and stop optional monitoring containers.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "=== Cleaning orphan / legacy containers ==="

LEGACY=(
  aiops-worker-ingestion-1
  aiops-worker-labeling-1
  aiops-worker-deploy-1
  aiops-worker-monitor-1
  aiops-worker-reports-1
)

for name in "${LEGACY[@]}"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "Removing legacy worker: $name"
    docker rm -f "$name" 2>/dev/null || true
  fi
done

if [ "${KEEP_MONITORING:-0}" != "1" ]; then
  for name in aiops-grafana-1 aiops-prometheus-1; do
    if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
      echo "Stopping optional monitoring: $name (set KEEP_MONITORING=1 to keep)"
      docker stop "$name" 2>/dev/null || true
      docker rm "$name" 2>/dev/null || true
    fi
  done
fi

echo "Applying current compose stack..."
"${COMPOSE[@]}" up -d --remove-orphans

echo ""
"${COMPOSE[@]}" ps
