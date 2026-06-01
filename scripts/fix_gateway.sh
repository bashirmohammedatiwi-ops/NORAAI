#!/bin/bash
# Fix 502 Bad Gateway — API up but nginx still points at old container IP.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)

# shellcheck disable=SC1091
source "$(dirname "$0")/load_env.sh"
load_env_file "${PROJECT_DIR}/.env"

api_port="${PORT_API:-6001}"
app_port="${PORT_APP:-8080}"

echo "=== Fix Bad Gateway ==="

echo "1) API direct..."
if curl -sf --max-time 8 "http://localhost:${api_port}/health/ready" >/dev/null; then
  echo "   API OK on port ${api_port}"
else
  echo "   API not ready — recovering stack..."
  ./scripts/ensure_services.sh recover
fi

echo "2) Restart gateway (refresh DNS upstream to api)..."
"${COMPOSE[@]}" restart gateway
sleep 5

echo "3) Gateway proxy check..."
if curl -sf --max-time 10 "http://localhost:${app_port}/health/ready" >/dev/null; then
  echo "   Gateway OK on port ${app_port}"
else
  echo "   Still failing — force-recreate api + gateway..."
  "${COMPOSE[@]}" up -d --force-recreate --no-deps api
  sleep 20
  "${COMPOSE[@]}" up -d --force-recreate --no-deps gateway
  sleep 8
fi

curl -sf "http://localhost:${app_port}/health/ready" && echo "Done — app is reachable." || {
  echo "ERROR: still Bad Gateway. Run: ./scripts/diagnose.sh"
  exit 1
}
