#!/bin/bash
# Start all AI Ops services (gateway, workers, monitoring).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Starting all services ==="
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Waiting for API..."
for i in $(seq 1 36); do
  if curl -sf "http://localhost:${PORT_API:-6001}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

echo ""
docker compose -f docker-compose.prod.yml ps

echo ""
echo "Health:"
curl -sf "http://localhost:${PORT_API:-6001}/health" >/dev/null && echo "  API (6001): OK" || echo "  API (6001): FAILED"
curl -sf "http://localhost:${PORT_APP:-8080}/health" >/dev/null && echo "  Gateway (8080): OK" || echo "  Gateway (8080): FAILED"

RUNNING=$(docker compose -f docker-compose.prod.yml ps --status running -q 2>/dev/null | wc -l)
TOTAL=$(docker compose -f docker-compose.prod.yml ps -q 2>/dev/null | wc -l)
echo ""
echo "Running: $RUNNING / $TOTAL containers"
echo "App: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo localhost):${PORT_APP:-8080}"
