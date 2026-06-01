#!/bin/bash
# =============================================================================
# AI Operations Center — VPS Deployment Script
# Ports: 8080 App | 6001 API | 6002 MinIO | 6003 MinIO UI | 6004 Grafana | 6005 Prometheus
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo " AI Operations Center — VPS Deploy"
echo " Directory: $PROJECT_DIR"
echo "=============================================="

# --- Docker ---
if ! command -v docker &>/dev/null; then
  echo "[1/6] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[1/6] Docker already installed"
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: docker compose plugin not found. Install docker-compose-plugin."
  exit 1
fi

# --- Environment ---
echo "[2/6] Preparing environment..."
if [ ! -f .env ]; then
  cp .env.production.example .env
  echo ""
  echo "  Created .env from .env.production.example"
  echo "  >>> EDIT .env NOW: passwords, SECRET_KEY, PUBLIC_URL <<<"
  echo ""
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  sed -i "s/REPLACE_WITH_openssl_rand_hex_32/$SECRET/" .env 2>/dev/null || \
    sed -i '' "s/REPLACE_WITH_openssl_rand_hex_32/$SECRET/" .env 2>/dev/null || true
fi

chmod +x scripts/sync_env.sh 2>/dev/null || true
./scripts/sync_env.sh .env

# Detect VPS IP (prefer IPv4)
VPS_IP=$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null || curl -4 -s --max-time 5 icanhazip.com 2>/dev/null || curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
if [ -n "$VPS_IP" ]; then
  sed -i "s|YOUR_VPS_IP|$VPS_IP|g" .env 2>/dev/null || \
    sed -i '' "s|YOUR_VPS_IP|$VPS_IP|g" .env 2>/dev/null || true
  echo "  Detected VPS IP: $VPS_IP"
fi

# --- GPU (optional) ---
echo "[3/6] Checking GPU..."
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
  echo "  NVIDIA GPU detected — set TRAINING_DOCKERFILE=Dockerfile.gpu in .env for GPU training"
else
  echo "  No GPU — using CPU training worker"
  grep -q "^TRAINING_DOCKERFILE=" .env && \
    sed -i 's/^TRAINING_DOCKERFILE=.*/TRAINING_DOCKERFILE=Dockerfile/' .env 2>/dev/null || \
    sed -i '' 's/^TRAINING_DOCKERFILE=.*/TRAINING_DOCKERFILE=Dockerfile/' .env 2>/dev/null || true
fi

# --- Build & Start ---
echo "[4/6] Building containers (first build may take 10-20 min)..."
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml build --parallel gateway api
if grep -qE '^TRAINING_DOCKERFILE=Dockerfile\.gpu' .env 2>/dev/null; then
  docker compose -f docker-compose.prod.yml build worker-training
else
  docker tag aiops-backend:latest aiops-backend-training:latest 2>/dev/null || true
fi

echo "[5/6] Starting containers..."
docker compose -f docker-compose.prod.yml up -d

echo "[6/6] Waiting for API health (up to 3 min)..."
OK=0
for i in $(seq 1 36); do
  if docker compose -f docker-compose.prod.yml ps api 2>/dev/null | grep -q "healthy"; then
    OK=1
    break
  fi
  if curl -sf http://localhost:${PORT_API:-6001}/health >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 5
done

if [ "$OK" -eq 0 ]; then
  echo ""
  echo "ERROR: API did not become healthy. Last 50 lines of api logs:"
  docker compose -f docker-compose.prod.yml logs --tail=50 api
  echo ""
  echo "Common fixes:"
  echo "  1. Ensure POSTGRES_PASSWORD in .env matches DATABASE_URL password"
  echo "  2. Run: ./scripts/sync_env.sh .env"
  echo "  3. If DB volume has wrong password: docker compose -f docker-compose.prod.yml down -v (DELETES DATA)"
  exit 1
fi

# Start gateway if api is healthy
docker compose -f docker-compose.prod.yml up -d gateway worker-ingestion worker-labeling worker-training worker-deploy worker-monitor worker-reports 2>/dev/null || \
  docker compose -f docker-compose.prod.yml up -d

if [ -x scripts/docker_cleanup_after_update.sh ]; then
  ./scripts/docker_cleanup_after_update.sh
fi

echo ""
echo "=============================================="
echo " DEPLOYMENT COMPLETE"
echo "=============================================="
echo ""
echo "  Main App:       http://${VPS_IP:-localhost}:${PORT_APP:-6000}"
echo "  API Docs:       http://${VPS_IP:-localhost}:${PORT_APP:-6000}/docs"
echo "  API Direct:     http://${VPS_IP:-localhost}:${PORT_API:-6001}/docs"
echo "  MinIO Console:  http://${VPS_IP:-localhost}:${PORT_MINIO_CONSOLE:-6003}"
echo "  Grafana:        http://${VPS_IP:-localhost}:${PORT_GRAFANA:-6004}"
echo "  Prometheus:     http://${VPS_IP:-localhost}:${PORT_PROMETHEUS:-6005}"
echo ""
echo "  Login: admin@aiops.com / (see ADMIN_PASSWORD in .env)"
echo "=============================================="
