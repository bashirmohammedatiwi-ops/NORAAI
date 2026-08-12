#!/bin/sh
set -e

echo "==> NURAI API starting..."

INIT_OK=0
for i in 1 2 3 4 5; do
  if python scripts/init_db.py; then
    echo "==> init_db OK"
    INIT_OK=1
    break
  fi
  echo "==> init_db attempt $i failed, retry in 3s..."
  sleep 3
done

if [ "$INIT_OK" != "1" ]; then
  echo "ERROR: init_db failed after 5 attempts — API will not start"
  exit 1
fi

echo "==> Starting uvicorn on :9000"
exec uvicorn app.main:app --host 0.0.0.0 --port 9000
