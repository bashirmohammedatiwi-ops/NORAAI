#!/bin/bash
# Start all AI Ops services (gateway, workers, monitoring).
set -euo pipefail

cd "$(dirname "$0")/.."
exec ./scripts/ensure_services.sh start
