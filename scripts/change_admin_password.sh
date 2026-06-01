#!/bin/bash
# Change admin login password (does not modify .env — update ADMIN_PASSWORD there manually).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -z "${ADMIN_NEW_PASSWORD:-}" ]; then
  echo "Usage: ADMIN_NEW_PASSWORD='your-new-password' ./scripts/change_admin_password.sh"
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
if [ -f "$COMPOSE_FILE" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T api python scripts/change_admin_password.py
else
  cd backend
  python scripts/change_admin_password.py
fi

echo "Done. Sign in again with the new password."
