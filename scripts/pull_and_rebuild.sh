#!/bin/bash
# Safe git pull + full rebuild (fixes local script edits + stale Docker cache).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== AI Ops: Pull & Rebuild ==="

echo "Resetting local edits to tracked scripts..."
git checkout -- scripts/ 2>/dev/null || true
git checkout -- backend/entrypoint.sh 2>/dev/null || true

echo "Pulling latest code..."
git pull origin main

for f in backend/entrypoint.sh scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

echo "Rebuilding gateway + API + workers (no cache)..."
docker compose -f docker-compose.prod.yml build --no-cache gateway api worker-ingestion worker-training

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d gateway api worker-ingestion worker-training worker-labeling worker-deploy worker-monitor worker-reports celery-beat 2>/dev/null || \
  docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Done. Open: http://$(curl -4 -s --max-time 3 ifconfig.me 2>/dev/null || echo YOUR_IP):${PORT_APP:-8080}/builder"
echo "Hard refresh browser: Ctrl+Shift+R"
