#!/bin/bash
# Keep only services defined in docker-compose.prod.yml (default profile).
# Removes legacy workers, old monitoring containers, and other orphans.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-aiops}"
COMPOSE=(docker compose -f docker-compose.prod.yml -p "${COMPOSE_PROJECT}")

echo "=== AI Ops stack cleanup (target: 10 containers) ==="

removed=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  echo "Removing ghost: ${name}"
  docker rm -f "$name" 2>/dev/null || true
  removed=$((removed + 1))
done < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^[0-9a-f]{8,}_aiops-' || true)

mapfile -t ALLOWED < <("${COMPOSE[@]}" config --services 2>/dev/null | sort -u)
echo "Allowed services: ${ALLOWED[*]}"

is_allowed() {
  local svc="$1"
  local s
  for s in "${ALLOWED[@]}"; do
    [ "$s" = "$svc" ] && return 0
  done
  return 1
}

while IFS= read -r cid; do
  [ -z "$cid" ] && continue
  name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's/^\///')
  svc=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$cid" 2>/dev/null || echo "")

  if [ -n "$svc" ] && is_allowed "$svc"; then
    continue
  fi

  echo "Removing extra container: ${name} (service=${svc:-unknown})"
  docker rm -f "$cid" 2>/dev/null || true
  removed=$((removed + 1))
done < <(
  docker ps -aq \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" 2>/dev/null || true
)

# Legacy names (if labels differ)
LEGACY=(
  aiops-worker-ingestion-1
  aiops-worker-labeling-1
  aiops-worker-deploy-1
  aiops-worker-monitor-1
  aiops-worker-reports-1
)
if [ "${KEEP_MONITORING:-0}" != "1" ]; then
  LEGACY+=(aiops-grafana-1 aiops-prometheus-1)
fi

for name in "${LEGACY[@]}"; do
  if docker ps -aq --format '{{.Names}}' | grep -qx "$name"; then
    echo "Removing legacy: $name"
    docker rm -f "$name" 2>/dev/null || true
    removed=$((removed + 1))
  fi
done

echo "Applying stack (remove-orphans)..."
"${COMPOSE[@]}" up -d --remove-orphans

echo "Restarting gateway (pick up current API address)..."
"${COMPOSE[@]}" restart gateway 2>/dev/null || true
sleep 5

running=$("${COMPOSE[@]}" ps -q 2>/dev/null | wc -l | tr -d ' ')
expected=${#ALLOWED[@]}

echo ""
echo "Removed ${removed} extra container(s)."
echo "Running now: ${running} (expected ${expected})"
echo ""
"${COMPOSE[@]}" ps

if [ "$running" -gt "$expected" ]; then
  echo ""
  echo "WARNING: still more than expected — run: docker compose -f docker-compose.prod.yml ps --format '{{.Service}}'"
  exit 1
fi
