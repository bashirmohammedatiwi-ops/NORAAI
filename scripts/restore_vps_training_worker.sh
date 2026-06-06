#!/usr/bin/env bash
# Run ON THE VPS — resume training on VPS instead of local PC.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "==> Starting VPS training worker..."
"${COMPOSE[@]}" up -d worker-training

echo "Done. Stop your local training worker on the PC."
