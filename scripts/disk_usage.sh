#!/bin/bash
# Show what is using disk space for AI Ops on VPS.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "=== Host disk ==="
df -h / /opt 2>/dev/null || df -h /

echo ""
echo "=== Project folder ==="
du -sh "$PROJECT_DIR" 2>/dev/null || true
du -sh "$PROJECT_DIR"/* 2>/dev/null | sort -hr | head -15 || true

echo ""
echo "=== Docker summary ==="
docker system df

echo ""
echo "=== AI Ops volumes (largest first) ==="
for v in $(docker volume ls -q | grep -E '^aiops_' || true); do
  size=$(docker run --rm -v "${v}:/data:ro" alpine du -sh /data 2>/dev/null | cut -f1)
  printf "  %-28s %s\n" "$v" "${size:-unknown}"
done

echo ""
echo "=== AI Ops images ==="
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E '^aiops|^REPOSITORY' || docker images | head -20

echo ""
echo "=== Build cache ==="
docker buildx du 2>/dev/null || docker system df | grep -i build || true

echo ""
echo "Typical causes of large disk use:"
echo "  1. minio_data        — uploaded images and model files"
echo "  2. training_data     — temporary training runs"
echo "  3. Docker build cache — many 'build --no-cache' runs"
echo "  4. Old Docker images — each rebuild keeps old layers (~2-4 GB per backend image)"
echo ""
echo "Safe cleanup:  ./scripts/cleanup_disk.sh"
echo "Full reset:    ./scripts/cleanup_disk.sh --volumes  (DELETES all project data)"
