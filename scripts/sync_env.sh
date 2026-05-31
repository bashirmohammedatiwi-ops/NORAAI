#!/bin/bash
# Sync DATABASE_URL passwords with POSTGRES_PASSWORD in .env
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Usage: $0 [.env]"
  exit 1
fi

PG_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)
PG_PASS=$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
PG_DB=$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)

if [ -z "$PG_USER" ] || [ -z "$PG_PASS" ] || [ -z "$PG_DB" ]; then
  echo "ERROR: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB must be set in $ENV_FILE"
  exit 1
fi

# URL-encode special chars in password (basic: warn if contains @ or :)
if echo "$PG_PASS" | grep -qE '[@:/]'; then
  echo "WARN: POSTGRES_PASSWORD contains special URL characters — ensure DATABASE_URL is encoded correctly"
fi

sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql+asyncpg://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}|" "$ENV_FILE"
sed -i "s|^DATABASE_URL_SYNC=.*|DATABASE_URL_SYNC=postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}|" "$ENV_FILE"

echo "Synced DATABASE_URL with POSTGRES_PASSWORD in $ENV_FILE"
