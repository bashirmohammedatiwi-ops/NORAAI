#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Prefer 3.12 — PyTorch / Ultralytics are reliable on 3.11–3.12 (not 3.14 yet).
PY="python3"
if command -v python3.12 >/dev/null 2>&1; then
  PY="python3.12"
elif command -v python3.11 >/dev/null 2>&1; then
  PY="python3.11"
fi

WANT_VER=$($PY -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Using $PY ($WANT_VER)"

if [ -d "venv" ]; then
  VENV_VER=$(grep '^version' venv/pyvenv.cfg 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")
  if [ -n "$VENV_VER" ] && [ "$VENV_VER" != "$WANT_VER" ]; then
    echo "Removing old venv (Python $VENV_VER → $WANT_VER)…"
    rm -rf venv
  fi
fi

if [ ! -d "venv" ]; then
  echo "Creating virtual environment…"
  "$PY" -m venv venv
fi

PIP="./venv/bin/pip"
echo "Installing dependencies (first run: PyTorch download may take 5–15 min)…"
$PIP install -U pip

# Stage 1 — web server (fast)
$PIP install \
  "fastapi>=0.115.0" \
  "uvicorn[standard]>=0.32.0" \
  "python-multipart>=0.0.12" \
  "Pillow>=10.0.0" \
  "PyYAML>=6.0" \
  "opencv-python-headless>=4.9.0"

# Stage 2 — ML stack (slow on first install)
if ! ./venv/bin/python -c "import torch" 2>/dev/null; then
  echo "Downloading PyTorch (large file)…"
  $PIP install torch torchvision
fi
if ! ./venv/bin/python -c "import ultralytics" 2>/dev/null; then
  $PIP install "ultralytics>=8.3.0"
fi

if [ ! -x "./venv/bin/uvicorn" ]; then
  echo "ERROR: uvicorn not installed. Run: rm -rf venv && ./start.sh"
  exit 1
fi

export PYTHONPATH="${PWD}:${PYTHONPATH:-}"
echo "▶ Rasid Local Trainer → http://127.0.0.1:8765"
./venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
