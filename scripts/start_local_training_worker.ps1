# Local Celery training worker — trains on THIS PC, saves to VPS DB + MinIO.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
$envFile = Join-Path $root ".env.local-worker"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $envFile)) {
    Write-Host "Create .env.local-worker from .env.local-worker.example" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Run scripts/setup_local_worker.ps1 first" -ForegroundColor Red
    exit 1
}

# Load .env.local-worker into process environment
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process')
}

# Quick connectivity check
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', 16379)
    $tcp.Close()
} catch {
    Write-Host "Cannot reach Redis on 127.0.0.1:16379 — start scripts/tunnel_vps.ps1 first" -ForegroundColor Red
    exit 1
}

$cores = [Environment]::ProcessorCount
if (-not $env:TRAINING_CPU_THREADS -or $env:TRAINING_CPU_THREADS -eq '0') {
    $env:TRAINING_CPU_THREADS = "$cores"
}

Write-Host "Local training worker starting ($($cores) CPU cores)..." -ForegroundColor Green
Write-Host "MinIO: $env:MINIO_ENDPOINT | Queue: training"
Write-Host "Start training from VPS UI — progress appears there; model saves to VPS."
Write-Host ""

$env:PYTHONPATH = $backend
Set-Location $backend
& $venvPython -m celery -A workers.celery_app worker -Q training -c 1 --prefetch-multiplier=1 --loglevel=info -n "local@%COMPUTERNAME"
