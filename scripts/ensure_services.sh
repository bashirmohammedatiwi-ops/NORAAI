#!/bin/bash
# Start or recover the Docker Compose stack (used on VPS boot and by systemd timer).
set -euo pipefail

MODE="${1:-start}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose -f docker-compose.prod.yml)
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/watchdog.log"
STATE_FILE="${LOG_DIR}/watchdog.state"

load_env() {
  # shellcheck disable=SC1091
  source "$(dirname "$0")/load_env.sh"
  load_env_file "${PROJECT_DIR}/.env"
}

log() {
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date -Iseconds)] $*"
}

fail_count() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

set_fail_count() {
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  echo "$1" > "$STATE_FILE"
}

reset_fail_count() {
  set_fail_count 0
}

inc_fail_count() {
  local n
  n="$(fail_count)"
  set_fail_count "$((n + 1))"
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
    if timeout 12 docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  log "ERROR: Docker daemon did not become ready."
  exit 1
}

restart_docker_daemon() {
  log "Restarting Docker daemon (unresponsive)..."
  if command -v systemctl &>/dev/null; then
    systemctl restart docker 2>/dev/null || true
  else
    service docker restart 2>/dev/null || true
  fi
  sleep 15
  ensure_docker
}

ensure_docker_responsive() {
  if timeout 12 docker info >/dev/null 2>&1; then
    return 0
  fi
  restart_docker_daemon
}

curl_ready() {
  local url="$1"
  local timeout="${2:-8}"
  curl -sf --max-time "$timeout" "$url" >/dev/null 2>&1
}

api_ready() {
  curl_ready "http://localhost:${PORT_API:-6001}/health/ready" 8
}

app_ready() {
  curl_ready "http://localhost:${PORT_APP:-8080}/health/ready" 10
}

wait_for_api() {
  local attempts="${1:-60}"
  local api_port="${PORT_API:-6001}"
  for i in $(seq 1 "$attempts"); do
    if curl_ready "http://localhost:${api_port}/health/ready" 10; then
      return 0
    fi
    if [ "$i" -eq 10 ] || [ "$i" -eq 25 ] || [ "$i" -eq 40 ]; then
      log "API not ready — force-recreate api (${i}/${attempts})"
      "${COMPOSE[@]}" up -d --force-recreate --no-deps api 2>/dev/null || "${COMPOSE[@]}" restart api 2>/dev/null || true
    fi
    sleep 5
  done
  return 1
}

wait_for_gateway() {
  local attempts="${1:-12}"
  for _ in $(seq 1 "$attempts"); do
    if app_ready; then
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
    "${COMPOSE[@]}" up -d --remove-orphans "$svc" 2>/dev/null || "${COMPOSE[@]}" restart "$svc" 2>/dev/null || true
    restarted=1
  done < <("${COMPOSE[@]}" ps --services --filter status=exited 2>/dev/null || true)

  if [ "$restarted" -eq 1 ]; then
    sleep 8
  fi
}

restart_unhealthy_containers() {
  local cid status name
  for cid in $("${COMPOSE[@]}" ps -q 2>/dev/null || true); do
    [ -z "$cid" ] && continue
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "none")
    if [ "$status" = "unhealthy" ]; then
      name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's/^\///' || echo "$cid")
      log "Restarting unhealthy container: $name"
      docker restart "$cid" 2>/dev/null || true
    fi
  done
}

log_memory_pressure() {
  if dmesg -T 2>/dev/null | tail -30 | grep -qiE 'oom|killed process|out of memory'; then
    log "WARNING: recent OOM events in kernel log — consider adding swap or upgrading RAM"
  fi
}

start_stack() {
  log "=== AI Ops: starting stack ==="
  ensure_docker_responsive
  load_env

  if [ -x "${PROJECT_DIR}/scripts/remove_compose_conflicts.sh" ]; then
    "${PROJECT_DIR}/scripts/remove_compose_conflicts.sh" 2>/dev/null || true
  fi

  "${COMPOSE[@]}" up -d --remove-orphans postgres redis minio autoheal
  sleep 3
  "${COMPOSE[@]}" up -d --remove-orphans api gateway driver celery-beat

  log "Waiting for API on port ${PORT_API:-6001}..."
  if ! wait_for_api 60; then
    log "ERROR: API did not become healthy — restarting core services"
    "${COMPOSE[@]}" restart postgres redis 2>/dev/null || true
    "${COMPOSE[@]}" up -d --force-recreate --no-deps api 2>/dev/null || true
    wait_for_api 36 || {
      "${COMPOSE[@]}" ps
      "${COMPOSE[@]}" logs --tail=30 api || true
      exit 1
    }
  fi

  log "Starting workers..."
  "${COMPOSE[@]}" up -d --remove-orphans worker-general worker-training

  log "Checking gateway on port ${PORT_APP:-8080}..."
  if ! wait_for_gateway 12; then
    log "Gateway cannot reach API — restarting gateway"
    "${COMPOSE[@]}" restart gateway 2>/dev/null || true
    wait_for_gateway 12 || true
  fi

  reset_fail_count
  log "Stack is up."
  "${COMPOSE[@]}" ps
}

watchdog() {
  load_env
  ensure_docker_responsive
  log_memory_pressure

  restart_exited_containers
  restart_unhealthy_containers

  api_ok=0
  app_ok=0
  api_ready && api_ok=1
  app_ready && app_ok=1

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    reset_fail_count
    log "watchdog: healthy"
    exit 0
  fi

  failures="$(fail_count)"
  inc_fail_count
  failures="$(fail_count)"
  log "watchdog: UNHEALTHY (api=${api_ok}, app=${app_ok}, consecutive_failures=${failures})"

  if [ "$api_ok" -eq 0 ]; then
    log "watchdog: force-recreate api"
    "${COMPOSE[@]}" up -d --force-recreate --no-deps api 2>/dev/null || "${COMPOSE[@]}" restart api 2>/dev/null || true
    sleep 15
    api_ready && api_ok=1
    log "watchdog: restart gateway (refresh API DNS upstream)"
    "${COMPOSE[@]}" restart gateway 2>/dev/null || true
    sleep 8
    app_ready && app_ok=1
  fi

  if [ "$app_ok" -eq 0 ]; then
    log "watchdog: restart gateway"
    "${COMPOSE[@]}" restart gateway 2>/dev/null || true
    sleep 8
    app_ready && app_ok=1
  fi

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    reset_fail_count
    log "watchdog: recovered after quick fix"
    exit 0
  fi

  if [ "$failures" -ge 2 ]; then
    log "watchdog: repeated failures — full stack recover"
    start_stack
    exit 0
  fi

  log "watchdog: still unhealthy — will retry on next timer run"
}

recover_stack() {
  load_env
  ensure_docker_responsive

  if [ -x "${PROJECT_DIR}/scripts/remove_compose_conflicts.sh" ]; then
    "${PROJECT_DIR}/scripts/remove_compose_conflicts.sh" 2>/dev/null || true
  fi

  restart_exited_containers
  restart_unhealthy_containers

  api_ok=0
  app_ok=0
  api_ready && api_ok=1
  app_ready && app_ok=1

  if [ "$api_ok" -eq 1 ] && [ "$app_ok" -eq 1 ]; then
    reset_fail_count
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
