#!/bin/bash
echo "=== AI Ops Container Status ==="
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== API Logs (last 30 lines) ==="
docker compose -f docker-compose.prod.yml logs --tail=30 api

echo ""
echo "=== Health Checks ==="
curl -sf "http://localhost:${PORT_API:-6001}/health/ready" && echo " API ready: OK" || echo " API ready: FAILED"
curl -sf "http://localhost:${PORT_API:-6001}/health" && echo " API live: OK" || echo " API live: FAILED"
curl -sf "http://localhost:${PORT_APP:-8080}/health/ready" && echo " Gateway ready: OK" || echo " Gateway ready: FAILED"
curl -sf "http://localhost:${PORT_APP:-8080}/" >/dev/null && echo " Gateway UI: OK" || echo " Gateway UI: FAILED"

echo ""
echo "=== Memory / OOM (last 20 kernel lines) ==="
dmesg -T 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -20 || echo "(no OOM lines or dmesg unavailable)"
free -h 2>/dev/null || true
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null | head -15 || true

if [ -f logs/watchdog.log ]; then
  echo ""
  echo "=== Watchdog log (last 15 lines) ==="
  tail -15 logs/watchdog.log
fi

echo ""
echo "=== .env DATABASE check ==="
grep -E '^(POSTGRES_PASSWORD|DATABASE_URL)=' .env | sed 's/:\/\/.*@/:\/\/***@/'
