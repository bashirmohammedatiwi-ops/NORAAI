#!/bin/sh
set -e

if echo "$*" | grep -q "uvicorn"; then
  echo "Waiting for PostgreSQL..."
  until python -c "
import sys
from sqlalchemy import create_engine, text
from app.core.config import get_settings
s = get_settings()
try:
    e = create_engine(s.database_url_sync)
    with e.connect() as c:
        c.execute(text('SELECT 1'))
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    sleep 2
  done

  echo "Initializing database..."
  python scripts/init_db.py || true
fi

exec "$@"
