#!/bin/bash
# Start or recover the Docker Compose stack (used on VPS boot and by systemd timer).
set -euo pipefail

MODE="${1:-start}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/watchdog.log"

load_env() {
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

log() {
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date -Iseconds)] $*"
}

ensure_docker() {
  if ! command -v docker &>/dev/null; then
    log "ERROR: Docker is not installed."
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
  log "ERROR: Docker daemon did not become ready."
  exit 1
}

curl_ok() {
  local url="$1"
  local timeout="${2:-8}"
  curl -sf --max-time "$timeout" "$url" >/dev/null 2>&1
}

wait_for_api() {
  local attempts="${1:-60}"
  local api_port="${PORT_API:-6001}"
  for i in $(seq 1 "$attempts"); do
    if curl_ok "http://localhost:${api_port}/health/ready" 10; then
      return 0
    fi
    if curl_ok "http://localhost:${api_port}/health" 5; then
      return 0
    fi
    if [ "$i" -eq 15 ] || [ "$i" -eq 30 ] || [ "$i" -eq 45 ]; then
      log "API not ready — restarting api (${i}/${attempts})"
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
    if curl_ok "http://localhost:${app_port}/health/ready" 10; then
      return 0
    fi
    if curl_ok "http://localhost:${app_port}/health" 8; then
      return 0
    fi
    if curl_ok "http://localhost:${app_port}/" 5; then
      return 0
    fi
    sleep 5
  done
  return 1
}

restart_exited_containers() {
  local restarted=0
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    log "Restarting exited service: $svc"
    "${COMPOSE[@]}" up -d "$svc" 2>/dev/null || "${COMPOSE[@]}" restart "$svc" 2>/dev/null || true
    restarted=1
  done < <("${COMPOSE[@]}" ps --services --filter status=exited 2>/dev/null || true)

  if [ "$restarted" -eq 1 ]; then
    sleep 8
  fi
}

start_stack() {
  log "=== AI Ops: starting stack ==="
  ensure_docker
  load_env

  "${COMPOSE[@]}" up -d postgres redis minio
  sleep 3
  "${COMPOSE[@]}" up -d api gateway driver celery-beat

  log "Waiting for API on port ${PORT_API:-6001}..."
  if ! wait_for_api 60; then
    log "ERROR: API did not become healthy — restarting core services"
    "${COMPOSE[@]}" restart postgres redis api 2>/dev/null || true
    wait_for_api 36 || {
      "${COMPOSE[@]}" ps
      "${COMPOSE[@]}" logs --tail=30 api || true
      exit 1
    }
  fi

  log "Starting workers..."
  "${COMPOSE[@]}" up -d worker-ingestion worker-labeling worker-training worker-deploy worker-monitor worker-reports

  log "Checking gateway on port ${PORT_APP:-8080}..."
  if ! wait_for_gateway 12; then
    log "Gateway unhealthy — restarting gateway + api proxy path"
    "${COMPOSE[@]}" restart gateway api 2>/dev/null || true
    wait_for_gateway 12 || true
  fi

  log "Stack is up."
  "${COMPOSE[@]}" ps
}

watchdog() {
  load_env
  ensure_docker

  api_port="${PORT_API:-6001}"
  app_port="${PORT_APP:-8080}"

  restart_exited_containers

  api_ok=0
  app_ok=0
  curl_ok "http://localhost:${api_port}/health/ready" 10 && api_ok=1
  curl_ok "http://localhost:${app_port}/health/ready" 10 && app_ok=1

  if [ "$api_ok" -eq 0 ]; then
    if curl_ok "http://localhost:${api_port}/health" 5; then
      api_ok=1
    fi
  fi
  if [ "$app_ok" -eq 0 ]; then
    if curl_ok "http://localhost:${app_port}/" 5; then
      app_ok=1
    fi
  fi

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    log "watchdog: healthy"
    exit 0
  fi

  log "watchdog: unhealthy (api=${api_ok}, app=${app_ok}) — quick recover"

  if [ "$api_ok" -eq 0 ]; then
    "${COMPOSE[@]}" restart api 2>/dev/null || true
    sleep 12
    curl_ok "http://localhost:${api_port}/health/ready" 15 || curl_ok "http://localhost:${api_port}/health" 8 || {
      log "watchdog: api still down — full recover"
      start_stack
      exit 0
    }
  fi

  if [ "$app_ok" -eq 0 ]; then
    "${COMPOSE[@]}" restart gateway 2>/dev/null || true
    sleep 5
    curl_ok "http://localhost:${app_port}/" 8 || {
      log "watchdog: gateway still down — full recover"
      start_stack
    }
  fi
}

recover_stack() {
  load_env
  ensure_docker

  api_port="${PORT_API:-6001}"
  app_port="${PORT_APP:-8080}"

  restart_exited_containers

  api_ok=0
  app_ok=0
  curl_ok "http://localhost:${api_port}/health/ready" 10 && api_ok=1
  curl_ok "http://localhost:${app_port}/health/ready" 10 && app_ok=1

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    log "recover: healthy"
    exit 0
  fi

  log "recover: unhealthy (api=${api_ok}, gateway=${app_ok}) — full start"
  start_stack
}

case "$MODE" in
  start) start_stack ;;
  recover) recover_stack ;;
  watchdog) watchdog ;;
  *)
    echo "Usage: $0 [start|recover|watchdog]"
    exit 1
    ;;
esac
