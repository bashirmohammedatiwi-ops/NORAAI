#!/bin/bash
# Remove ghost containers that block "docker compose up" (hash-prefixed project names).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "Stopping compose stack..."
"${COMPOSE[@]}" down --remove-orphans 2>/dev/null || true

removed=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  echo "Removing stale container: ${name}"
  docker rm -f "$name" 2>/dev/null || true
  removed=$((removed + 1))
done < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^[0-9a-f]{8,}_aiops-' || true)

# Duplicate gateway/api from failed recreate
for svc in gateway api worker-general worker-training celery-beat; do
  count=$(docker ps -aq --filter "name=${svc}" --filter "label=com.docker.compose.service=${svc}" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${count:-0}" -gt 1 ]; then
    echo "Multiple ${svc} containers — removing all, compose will recreate..."
    docker ps -aq --filter "label=com.docker.compose.service=${svc}" 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true
    removed=$((removed + 1))
  fi
done

echo "Removed ${removed} stale container(s)."
