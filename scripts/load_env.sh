#!/bin/bash
# Load selected .env keys safely (values may contain spaces).
# Usage: load_env_file [path]   — exports PORT_*, POSTGRES_*, API_*, CELERY_*, APP_* vars.

load_env_file() {
  local file="${1:-.env}"
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="${line//$'\r'/}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [[ "$line" != *=* ]] && continue

    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"

    case "$key" in
      PORT_*|POSTGRES_*|API_*|CELERY_*|APP_*|PUBLIC_URL|TRAINING_DOCKERFILE)
        if [[ "$val" == \"*\" ]]; then
          val="${val:1:${#val}-2}"
        elif [[ "$val" == \'*\' ]]; then
          val="${val:1:${#val}-2}"
        fi
        export "$key=$val"
        ;;
    esac
  done < "$file"
}
