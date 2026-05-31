#!/bin/bash
# One-shot VPS update: pull latest code, fix line endings, sync DB passwords, rebuild API.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== AI Ops VPS Update ==="

# Discard local edits to tracked deploy scripts (common after first deploy)
if git diff --quiet scripts/deploy_vps.sh 2>/dev/null; then
  :
else
  echo "Resetting local changes to scripts/deploy_vps.sh ..."
  git checkout -- scripts/deploy_vps.sh
fi

echo "Pulling latest code..."
git pull origin main

# Fix Windows CRLF in shell scripts (breaks entrypoint on Linux)
for f in backend/entrypoint.sh scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created .env — edit passwords before continuing."
  exit 1
fi

chmod +x scripts/sync_env.sh scripts/diagnose.sh scripts/deploy_vps.sh
./scripts/sync_env.sh .env

echo "Rebuilding API (no cache)..."
docker compose -f docker-compose.prod.yml build --no-cache api

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
  echo ""
  echo "If logs show 'password authentication failed', reset DB volume:"
  echo "  docker compose -f docker-compose.prod.yml down -v"
  echo "  ./scripts/sync_env.sh .env"
  echo "  docker compose -f docker-compose.prod.yml up -d --build"
  exit 1
fi

docker compose -f docker-compose.prod.yml up -d gateway worker-ingestion worker-labeling worker-training worker-deploy worker-monitor worker-reports 2>/dev/null || \
  docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Update complete. App: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo localhost):${PORT_APP:-6000}"
