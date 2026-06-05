#!/bin/bash
# One-shot permanent fix: ghost containers, gateway, 4GB uploads, auto-recovery.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo " NORAAI — إصلاح نهائي للسيرفر"
echo "=============================================="

for f in scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

echo "[1/6] Pull latest code..."
git checkout -- scripts/ systemd/ backend/entrypoint.sh DEPLOY.md .env.production.example 2>/dev/null || true
if ! git pull origin main; then
  echo "Local changes blocked pull — resetting to origin/main..."
  git fetch origin main
  git reset --hard origin/main
fi

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created .env — edit passwords then re-run."
  exit 1
fi

echo "[2/6] Stable Docker project name..."
if grep -q '^COMPOSE_PROJECT_NAME=' .env 2>/dev/null; then
  sed -i 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=aiops/' .env
else
  echo 'COMPOSE_PROJECT_NAME=aiops' >> .env
fi
export COMPOSE_PROJECT_NAME=aiops
./scripts/sync_env.sh .env

echo "[3/6] Remove ghost containers..."
./scripts/remove_compose_conflicts.sh

echo "[4/6] Rebuild gateway + API (4GB upload, long timeouts)..."
docker compose -f docker-compose.prod.yml -p aiops build gateway api
docker tag aiops-backend:latest aiops-backend-training:latest 2>/dev/null || true

echo "[5/6] Start stack..."
docker compose -f docker-compose.prod.yml -p aiops up -d --remove-orphans
./scripts/cleanup_orphans.sh
./scripts/ensure_services.sh recover

if [ "$(id -u)" -eq 0 ] && command -v systemctl &>/dev/null; then
  echo "[6/6] Install boot + watchdog timer..."
  ./scripts/install_boot_service.sh 2>/dev/null || true
else
  echo "[6/6] Watchdog (run once as root): sudo ./scripts/install_boot_service.sh"
fi

# shellcheck disable=SC1091
source "$(dirname "$0")/load_env.sh"
load_env_file "${PROJECT_DIR}/.env"
APP_PORT="${PORT_APP:-8080}"
API_PORT="${PORT_API:-6001}"

echo ""
echo "=== Health ==="
if curl -sf --max-time 15 "http://localhost:${API_PORT}/health/ready" >/dev/null; then
  echo "  API     OK (:${API_PORT})"
else
  echo "  API     FAIL"
fi
if curl -sf --max-time 15 "http://localhost:${APP_PORT}/health/ready" >/dev/null; then
  echo "  Gateway OK (:${APP_PORT})"
else
  echo "  Gateway FAIL — run: ./scripts/fix_gateway.sh"
fi

VPS_IP=$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
docker compose -f docker-compose.prod.yml -p aiops ps
echo ""
echo "App: http://${VPS_IP:-localhost}:${APP_PORT}"
echo "Large ZIP upload limit: 4 GB"
echo "=============================================="
