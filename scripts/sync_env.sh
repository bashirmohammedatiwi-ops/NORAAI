#!/bin/bash
# Sync DATABASE_URL passwords with POSTGRES_PASSWORD in .env
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Usage: $0 [.env]"
  exit 1
fi

export SYNC_ENV_FILE="$ENV_FILE"
export SYNC_PG_USER="$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"
export SYNC_PG_PASS="$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"
export SYNC_PG_DB="$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"

if [ -z "$SYNC_PG_USER" ] || [ -z "$SYNC_PG_PASS" ] || [ -z "$SYNC_PG_DB" ]; then
  echo "ERROR: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB must be set in $ENV_FILE"
  exit 1
fi

python3 << 'PY'
from urllib.parse import quote_plus
import os
import re
from pathlib import Path

env_path = Path(os.environ["SYNC_ENV_FILE"])
user = os.environ["SYNC_PG_USER"]
password = quote_plus(os.environ["SYNC_PG_PASS"])
db = os.environ["SYNC_PG_DB"]

async_url = f"postgresql+asyncpg://{user}:{password}@postgres:5432/{db}"
sync_url = f"postgresql://{user}:{password}@postgres:5432/{db}"

text = env_path.read_text(encoding="utf-8")
text = re.sub(r"^DATABASE_URL=.*$", f"DATABASE_URL={async_url}", text, flags=re.M)
text = re.sub(r"^DATABASE_URL_SYNC=.*$", f"DATABASE_URL_SYNC={sync_url}", text, flags=re.M)

# APP_NAME with spaces must be quoted or bash/systemd break when sourcing .env
if re.search(r"^APP_NAME=AI Operations Center\s*$", text, flags=re.M):
    text = re.sub(
        r"^APP_NAME=AI Operations Center\s*$",
        'APP_NAME="AI Operations Center"',
        text,
        flags=re.M,
    )

env_path.write_text(text, encoding="utf-8")
print(f"Synced DATABASE_URL with POSTGRES_PASSWORD in {env_path}")
PY
