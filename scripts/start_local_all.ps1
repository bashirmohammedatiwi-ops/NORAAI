# Start local UI + training worker (VPS data/models).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local-worker"

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root ".env.local-worker.example") $envFile
}

$content = Get-Content $envFile -Raw
if ($content -match 'CHANGE_STRONG_DB_PASSWORD|YOUR_VPS_IP') {
    Write-Host "Edit .env.local-worker first — set POSTGRES_PASSWORD and MINIO keys (same as VPS /opt/aiops/.env)" -ForegroundColor Yellow
    Write-Host "  notepad $envFile"
    exit 1
}

Write-Host "=== 1/3 Frontend (http://localhost:5173 -> VPS) ===" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start_local_app.ps1")

Start-Sleep -Seconds 2
Write-Host "=== 2/3 SSH tunnel (keep window open) ===" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "tunnel_vps.ps1")

Write-Host "Wait for tunnel (enter SSH password if asked)..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

Write-Host "=== 3/3 Training worker (local CPU) ===" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start_local_training_worker.ps1")

Write-Host ""
Write-Host "Open http://localhost:5173 — train from UI; model saves to VPS." -ForegroundColor Green
