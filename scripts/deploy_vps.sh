#!/bin/bash
# =============================================================================
# AI Operations Center — VPS Deployment Script
# Ports: 6000 App | 6001 API | 6002 MinIO | 6003 MinIO UI | 6004 Grafana | 6005 Prometheus
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
  echo "[1/5] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[1/5] Docker already installed"
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: docker compose plugin not found. Install docker-compose-plugin."
  exit 1
fi

# --- Environment ---
echo "[2/5] Preparing environment..."
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

# Detect VPS IP
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
if [ -n "$VPS_IP" ]; then
  sed -i "s|YOUR_VPS_IP|$VPS_IP|g" .env 2>/dev/null || \
    sed -i '' "s|YOUR_VPS_IP|$VPS_IP|g" .env 2>/dev/null || true
  echo "  Detected VPS IP: $VPS_IP"
fi

# --- GPU (optional) ---
echo "[3/5] Checking GPU..."
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
  echo "  NVIDIA GPU detected — set TRAINING_DOCKERFILE=Dockerfile.gpu in .env for GPU training"
else
  echo "  No GPU — using CPU training worker"
  grep -q "^TRAINING_DOCKERFILE=" .env && \
    sed -i 's/^TRAINING_DOCKERFILE=.*/TRAINING_DOCKERFILE=Dockerfile/' .env 2>/dev/null || \
    sed -i '' 's/^TRAINING_DOCKERFILE=.*/TRAINING_DOCKERFILE=Dockerfile/' .env 2>/dev/null || true
fi

# --- Build & Start ---
echo "[4/5] Building and starting containers (this may take 10-20 min first time)..."
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml build --parallel
docker compose -f docker-compose.prod.yml up -d

echo "[5/5] Waiting for services..."
sleep 15

# Health check
if curl -sf http://localhost:${PORT_APP:-6000}/health >/dev/null 2>&1; then
  echo "  Health check: OK"
else
  echo "  Health check: waiting..."
  for i in $(seq 1 30); do
    curl -sf http://localhost:${PORT_APP:-6000}/health >/dev/null 2>&1 && break
    sleep 5
  done
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
echo "  Login: admin@aiops.local / (see ADMIN_PASSWORD in .env)"
echo ""
echo "  Useful commands:"
echo "    docker compose -f docker-compose.prod.yml logs -f api"
echo "    docker compose -f docker-compose.prod.yml ps"
echo "    docker compose -f docker-compose.prod.yml restart"
echo "=============================================="
