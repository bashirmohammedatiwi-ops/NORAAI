#!/usr/bin/env bash
# Run ON THE VPS — lets your PC run training; VPS keeps DB, MinIO, and models.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.remote-worker.yml)

echo "==> Applying remote-worker overlay (Postgres/Redis on 127.0.0.1 for SSH tunnel)..."
"${COMPOSE[@]}" up -d

echo "==> Stopping VPS training worker (local PC will consume training queue)..."
"${COMPOSE[@]}" stop worker-training 2>/dev/null || true

echo ""
echo "Remote training enabled on VPS."
echo "  - Postgres: 127.0.0.1:5432 (SSH tunnel only)"
echo "  - Redis:    127.0.0.1:6379 (SSH tunnel only)"
echo "  - MinIO:    port \${PORT_MINIO_API:-6002} (public on VPS IP)"
echo ""
echo "On your PC:"
echo "  1. scripts/tunnel_vps.ps1"
echo "  2. scripts/start_local_training_worker.ps1"
echo "  3. Open VPS UI or scripts/start_local_app.ps1"
