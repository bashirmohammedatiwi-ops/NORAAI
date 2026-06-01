#!/bin/bash
# Install systemd units so the stack starts automatically after VPS reboot.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v systemctl &>/dev/null; then
  echo "systemd not found — skip boot service install (use ./scripts/ensure_services.sh manually after reboot)."
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root to install boot service:"
  echo "  sudo ./scripts/install_boot_service.sh"
  exit 1
fi

chmod +x scripts/ensure_services.sh scripts/start_all.sh

sed "s|/opt/aiops|${PROJECT_DIR}|g" systemd/aiops.service > /etc/systemd/system/aiops.service
sed "s|/opt/aiops|${PROJECT_DIR}|g" systemd/aiops-health.service > /etc/systemd/system/aiops-health.service
cp systemd/aiops-health.timer /etc/systemd/system/aiops-health.timer

systemctl daemon-reload
systemctl enable docker
systemctl enable aiops.service
systemctl enable aiops-health.timer
systemctl start aiops-health.timer

echo ""
echo "Installed:"
echo "  aiops.service       — starts stack on boot"
echo "  aiops-health.timer  — recovers stack every 10 min if unhealthy"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status aiops"
echo "  sudo journalctl -u aiops -n 50"
echo "  sudo ./scripts/ensure_services.sh recover"
