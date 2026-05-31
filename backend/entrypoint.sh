#!/bin/sh
set -e

if echo "$*" | grep -q "uvicorn"; then
  echo "=== AI Ops API Startup ==="
  python scripts/wait_for_db.py
  echo "Initializing database..."
  python scripts/init_db.py || echo "WARN: init_db returned non-zero (continuing)"
fi

exec "$@"
