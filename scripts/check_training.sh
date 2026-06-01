#!/bin/bash
# Diagnose why training stays at 0% or times out.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "=== Training diagnostics ==="

echo ""
echo "--- worker-training ---"
"${COMPOSE[@]}" ps worker-training 2>/dev/null || true
"${COMPOSE[@]}" logs worker-training --tail 40 2>/dev/null || true

echo ""
echo "--- Redis / Celery queue ---"
"${COMPOSE[@]}" exec -T redis redis-cli ping 2>/dev/null || echo "Redis unreachable"
"${COMPOSE[@]}" exec -T redis redis-cli -n 1 LLEN training 2>/dev/null || true

echo ""
echo "--- API ---"
curl -sf --max-time 8 "http://localhost:${PORT_API:-6001}/health/ready" && echo "API ready OK" || echo "API NOT ready"

echo ""
echo "--- Stuck jobs (pending/running) ---"
"${COMPOSE[@]}" exec -T api python - <<'PY' 2>/dev/null || true
import os
from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
if not url:
    print("(no DATABASE_URL)")
    raise SystemExit(0)
engine = create_engine(url)
with engine.connect() as conn:
    rows = conn.execute(text("""
        SELECT id, name, status, celery_task_id, error_message, created_at
        FROM training_jobs
        WHERE status IN ('pending', 'running')
        ORDER BY created_at DESC
        LIMIT 5
    """)).fetchall()
    for r in rows:
        print(dict(r._mapping))
PY

echo ""
echo "Fix attempts:"
echo "  docker compose -f docker-compose.prod.yml restart worker-training api gateway"
echo "  ./scripts/fix_gateway.sh"
