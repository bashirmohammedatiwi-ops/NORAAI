# Run desktop stack without building EXE (test performance mode locally).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$env:NORAAI_ROOT = $root
Copy-Item (Join-Path $root ".env.desktop") (Join-Path $root "backend\.env") -Force
Copy-Item (Join-Path $root "frontend\.env.desktop") (Join-Path $root "frontend\.env.local") -Force

Write-Host "Desktop mode — TRAINING_DEVICE=auto (CPU + Intel GPU when DirectML installed)" -ForegroundColor Cyan
Start-Process "http://127.0.0.1:8000"
& (Join-Path $root "backend\.venv\Scripts\python.exe") (Join-Path $root "backend\launcher\run_stack.py")
