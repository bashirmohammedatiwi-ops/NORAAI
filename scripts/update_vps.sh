#!/bin/bash
# One-shot VPS update: pull latest code, rebuild with cache, prune old Docker layers.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

NO_CACHE=""
for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    -h|--help)
      echo "Usage: $0 [--no-cache]"
      echo "  default    Rebuild using Docker layer cache (recommended — saves ~5-10 GB per update)"
      echo "  --no-cache Force full rebuild (use only if UI changes do not appear)"
      exit 0
      ;;
  esac
done

echo "=== AI Ops VPS Update ==="

echo "Resetting local edits to tracked scripts..."
git checkout -- scripts/ 2>/dev/null || true
git checkout -- backend/entrypoint.sh 2>/dev/null || true

echo "Pulling latest code..."
git pull origin main

for f in backend/entrypoint.sh scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created .env — edit passwords before continuing."
  exit 1
fi

chmod +x scripts/sync_env.sh scripts/diagnose.sh scripts/deploy_vps.sh scripts/pull_and_rebuild.sh scripts/docker_cleanup_after_update.sh
./scripts/sync_env.sh .env

echo "Rebuilding gateway + backend (Docker cache: $([ -n "$NO_CACHE" ] && echo off || echo on))..."
docker compose -f docker-compose.prod.yml build $NO_CACHE gateway api

if grep -qE '^TRAINING_DOCKERFILE=Dockerfile\.gpu' .env 2>/dev/null; then
  echo "GPU training image detected — rebuilding worker-training..."
  docker compose -f docker-compose.prod.yml build $NO_CACHE worker-training
else
  echo "CPU training — reusing backend image for worker-training..."
  docker tag aiops-backend:latest aiops-backend-training:latest
fi

echo "Restarting stack..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for API (up to 4 min)..."
OK=0
for i in $(seq 1 48); do
  if docker compose -f docker-compose.prod.yml ps api 2>/dev/null | grep -q "healthy"; then
    OK=1
    break
  fi
  if curl -sf "http://localhost:${PORT_API:-6001}/health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 5
done

if [ "$OK" -eq 0 ]; then
  echo ""
  echo "API still unhealthy. Running diagnose..."
  ./scripts/diagnose.sh
  exit 1
fi

docker compose -f docker-compose.prod.yml up -d gateway worker-ingestion worker-labeling worker-training worker-deploy worker-monitor worker-reports 2>/dev/null || \
  docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Reclaiming disk from old Docker layers..."
./scripts/docker_cleanup_after_update.sh

echo ""
echo "Update complete."
echo "  Dataset Builder: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo localhost):${PORT_APP:-8080}/builder"
echo "  Hard refresh browser: Ctrl+Shift+R"
echo ""
echo "Disk usage: ./scripts/disk_usage.sh"
