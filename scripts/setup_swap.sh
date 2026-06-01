#!/bin/bash
# Add 2 GB swap on VPS to reduce OOM kills (safe to run multiple times).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo ./scripts/setup_swap.sh"
  exit 1
fi

SWAP_FILE="/swapfile"
SWAP_GB="${SWAP_GB:-2}"

if swapon --show | grep -q "$SWAP_FILE"; then
  echo "Swap already active: $SWAP_FILE"
  swapon --show
  exit 0
fi

if [ -f "$SWAP_FILE" ]; then
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null 2>&1 || true
  swapon "$SWAP_FILE"
else
  echo "Creating ${SWAP_GB}G swap at $SWAP_FILE ..."
  fallocate -l "${SWAP_GB}G" "$SWAP_FILE" 2>/dev/null || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$((SWAP_GB * 1024))" status=progress
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
fi

if ! grep -q "$SWAP_FILE" /etc/fstab 2>/dev/null; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# Prefer keeping apps in RAM; use swap only under pressure
if [ -f /proc/sys/vm/swappiness ]; then
  echo 10 > /proc/sys/vm/swappiness
  grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "Swap enabled:"
swapon --show
free -h
