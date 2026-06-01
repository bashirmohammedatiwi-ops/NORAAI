#!/bin/bash
# Safe git pull + rebuild (uses Docker cache by default).
set -euo pipefail

cd "$(dirname "$0")/.."

NO_CACHE=""
for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
  esac
done

echo "=== AI Ops: Pull & Rebuild ==="

echo "Resetting local edits to tracked scripts..."
git checkout -- scripts/ 2>/dev/null || true
git checkout -- backend/entrypoint.sh 2>/dev/null || true

echo "Pulling latest code..."
git pull origin main

for f in backend/entrypoint.sh scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

chmod +x scripts/docker_cleanup_after_update.sh 2>/dev/null || true

echo "Rebuilding gateway + backend (cache: $([ -n "$NO_CACHE" ] && echo off || echo on))..."
docker compose -f docker-compose.prod.yml build $NO_CACHE gateway api

if [ -f .env ] && grep -qE '^TRAINING_DOCKERFILE=Dockerfile\.gpu' .env 2>/dev/null; then
  docker compose -f docker-compose.prod.yml build $NO_CACHE worker-training
else
  docker tag aiops-backend:latest aiops-backend-training:latest 2>/dev/null || true
fi

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans gateway api worker-general worker-training celery-beat 2>/dev/null || \
  docker compose -f docker-compose.prod.yml up -d

./scripts/docker_cleanup_after_update.sh

echo ""
echo "Done. Open: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo YOUR_IP):${PORT_APP:-8080}/builder"
echo "Hard refresh browser: Ctrl+Shift+R"
