#!/bin/bash
echo "=== AI Ops Container Status ==="
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== API Logs (last 30 lines) ==="
docker compose -f docker-compose.prod.yml logs --tail=30 api

echo ""
echo "=== Health Checks ==="
curl -sf "http://localhost:${PORT_API:-6001}/health" && echo " API: OK" || echo " API: FAILED"
curl -sf "http://localhost:${PORT_APP:-8080}/health" && echo " Gateway: OK" || echo " Gateway: FAILED"

echo ""
echo "=== .env DATABASE check ==="
grep -E '^(POSTGRES_PASSWORD|DATABASE_URL)=' .env | sed 's/:\/\/.*@/:\/\/***@/'
