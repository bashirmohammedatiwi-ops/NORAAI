#!/bin/bash
# Start or recover the Docker Compose stack (used on VPS boot and by systemd timer).
set -euo pipefail

MODE="${1:-start}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)

load_env() {
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

ensure_docker() {
  if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed."
    exit 1
  fi
  if command -v systemctl &>/dev/null; then
    systemctl enable docker 2>/dev/null || true
    systemctl start docker 2>/dev/null || true
  fi
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "ERROR: Docker daemon did not become ready."
  exit 1
}

wait_for_api() {
  local attempts="${1:-60}"
  local api_port="${PORT_API:-6001}"
  for i in $(seq 1 "$attempts"); do
    if curl -sf "http://localhost:${api_port}/health" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$i" -eq 20 ] || [ "$i" -eq 40 ]; then
      echo "  API not ready yet — restarting api (attempt ${i}/${attempts})..."
      "${COMPOSE[@]}" restart api 2>/dev/null || true
    fi
    sleep 5
  done
  return 1
}

wait_for_gateway() {
  local attempts="${1:-12}"
  local app_port="${PORT_APP:-8080}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf "http://localhost:${app_port}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

start_stack() {
  echo "=== AI Ops: starting stack ==="
  ensure_docker
  load_env

  "${COMPOSE[@]}" up -d postgres redis minio
  "${COMPOSE[@]}" up -d api
  "${COMPOSE[@]}" up -d gateway driver celery-beat

  echo "Waiting for API on port ${PORT_API:-6001}..."
  if ! wait_for_api 60; then
    echo "ERROR: API did not become healthy."
    "${COMPOSE[@]}" ps
    "${COMPOSE[@]}" logs --tail=40 api || true
    exit 1
  fi

  echo "Starting workers..."
  "${COMPOSE[@]}" up -d worker-ingestion worker-labeling worker-training worker-deploy worker-monitor worker-reports

  echo "Checking gateway on port ${PORT_APP:-8080}..."
  if ! wait_for_gateway 12; then
    echo "Gateway unhealthy — restarting gateway..."
    "${COMPOSE[@]}" restart gateway
    wait_for_gateway 12 || true
  fi

  echo "Stack is up."
  "${COMPOSE[@]}" ps
}

recover_stack() {
  load_env
  ensure_docker

  api_port="${PORT_API:-6001}"
  app_port="${PORT_APP:-8080}"

  api_ok=0
  app_ok=0
  curl -sf "http://localhost:${api_port}/health" >/dev/null 2>&1 && api_ok=1
  curl -sf "http://localhost:${app_port}/health" >/dev/null 2>&1 && app_ok=1

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    echo "AI Ops: API and gateway healthy."
    exit 0
  fi

  echo "AI Ops: unhealthy (api=${api_ok}, gateway=${app_ok}) — recovering..."
  start_stack
}

case "$MODE" in
  start) start_stack ;;
  recover) recover_stack ;;
  *)
    echo "Usage: $0 [start|recover]"
    exit 1
    ;;
esac
