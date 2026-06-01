#!/bin/bash
# One-shot VPS update: pull latest code, rebuild with cache, prune old Docker layers.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

NO_CACHE=""
FORCE_GIT=""
for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --force) FORCE_GIT="1" ;;
    -h|--help)
      echo "Usage: $0 [--no-cache] [--force]"
      echo "  default    Rebuild using Docker layer cache (recommended — saves ~5-10 GB per update)"
      echo "  --no-cache Force full rebuild (use only if UI changes do not appear)"
      echo "  --force    Discard ALL local git changes and match origin/main (fixes pull conflicts on VPS)"
      exit 0
      ;;
  esac
done

echo "=== AI Ops VPS Update ==="

echo "Resetting local edits to tracked deploy files..."
git checkout -- scripts/ systemd/ backend/entrypoint.sh DEPLOY.md .env.production.example 2>/dev/null || true

echo "Pulling latest code..."
if ! git pull origin main; then
  if [ "$FORCE_GIT" = "1" ]; then
    echo "Pull failed — hard reset to origin/main (--force)..."
    git fetch origin main
    git reset --hard origin/main
  else
    echo ""
    echo "ERROR: git pull blocked by local changes on the VPS."
    echo "Re-run with:  ./scripts/update_vps.sh --force"
    echo "Or manually:   git checkout -- scripts/ systemd/ && git pull"
    exit 1
  fi
fi

for f in backend/entrypoint.sh scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created .env — edit passwords before continuing."
  exit 1
fi

chmod +x scripts/sync_env.sh scripts/diagnose.sh scripts/deploy_vps.sh scripts/pull_and_rebuild.sh scripts/docker_cleanup_after_update.sh scripts/ensure_services.sh scripts/install_boot_service.sh scripts/cleanup_orphans.sh scripts/load_env.sh scripts/setup_swap.sh
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
docker compose -f docker-compose.prod.yml up -d --remove-orphans
./scripts/cleanup_orphans.sh

echo "Waiting for API (up to 4 min)..."
OK=0
for i in $(seq 1 48); do
  if docker compose -f docker-compose.prod.yml ps api 2>/dev/null | grep -q "healthy"; then
    OK=1
    break
  fi
  if curl -sf "http://localhost:${PORT_API:-6001}/health/ready" >/dev/null 2>&1; then
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
  echo "API still unhealthy — running recover..."
  ./scripts/ensure_services.sh recover || {
    ./scripts/diagnose.sh
    exit 1
  }
else
  docker compose -f docker-compose.prod.yml up -d --remove-orphans gateway worker-general worker-training 2>/dev/null || \
    docker compose -f docker-compose.prod.yml up -d --remove-orphans
fi

echo ""
echo "Running post-update health check..."
./scripts/ensure_services.sh recover

echo ""
echo "Reclaiming disk from old Docker layers..."
./scripts/docker_cleanup_after_update.sh

echo ""
echo "Update complete."
echo "  App: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo localhost):${PORT_APP:-8080}"
echo ""
if command -v systemctl &>/dev/null && systemctl list-unit-files aiops-health.timer 2>/dev/null | grep -q enabled; then
  echo "Watchdog timer: enabled (checks every 2 min)"
  sudo systemctl restart aiops-health.timer 2>/dev/null || true
else
  echo "IMPORTANT — install auto-recovery (once):"
  echo "  sudo ./scripts/install_boot_service.sh"
  echo "  sudo ./scripts/setup_swap.sh   # optional 2GB swap against OOM"
fi
echo "Manual recover: ./scripts/ensure_services.sh recover"
echo "Watchdog log:   tail -f logs/watchdog.log"
echo "Disk usage:     ./scripts/disk_usage.sh"
