#!/bin/bash
# Reclaim Docker disk after deploy/update — safe for running stack (no volume deletion).
set -euo pipefail

echo "=== Docker cleanup after update ==="
echo "Before:"
df -h / | tail -1
docker system df 2>/dev/null || true

echo ""
echo "Removing dangling images..."
docker image prune -f

echo "Removing unused images (keeps images used by running containers)..."
docker image prune -a -f

echo "Removing unused build cache..."
docker builder prune -af 2>/dev/null || docker buildx prune -af 2>/dev/null || true

echo ""
echo "After:"
df -h / | tail -1
docker system df 2>/dev/null || true
echo "Cleanup complete."
