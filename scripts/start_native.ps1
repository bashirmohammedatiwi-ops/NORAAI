# Start full local app without Docker (Postgres + Redis + MinIO + API + workers + UI).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$tools = Join-Path $root "tools\native"
$redisServer = Join-Path $tools "redis\redis-server.exe"
$minioExe = Join-Path $tools "minio\minio.exe"
$pgBin = Join-Path $tools "postgresql\bin"
$pgData = Join-Path $tools "pgdata"
$venvPy = Join-Path $root "backend\.venv\Scripts\python.exe"
$pidFile = Join-Path $tools "native.pids.json"

if (-not (Test-Path $redisServer)) {
    Write-Host "Run scripts\install_native.ps1 first" -ForegroundColor Red
    exit 1
}

# Use native env for backend (cwd = backend when uvicorn/celery run)
$envNative = Join-Path $root ".env.native"
Copy-Item $envNative (Join-Path $root ".env") -Force
Copy-Item $envNative (Join-Path $root "backend\.env") -Force
$standaloneFe = Join-Path $root "frontend\.env.standalone"
if (Test-Path $standaloneFe) {
    Copy-Item $standaloneFe (Join-Path $root "frontend\.env.local") -Force
}

function Test-Port($port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $port)
        $c.Close()
        return $true
    } catch { return $false }
}

function Start-Background($name, $file, $argList, $wd) {
    $params = @{
        FilePath         = $file
        WorkingDirectory = $wd
        WindowStyle      = "Minimized"
        PassThru         = $true
    }
    if ($argList -and $argList.Count -gt 0) {
        $params.ArgumentList = $argList
    }
    $p = Start-Process @params
    return @{ name = $name; pid = $p.Id }
}

$pids = @()

# PostgreSQL
if (-not (Test-Port 5432)) {
    Write-Host "Starting PostgreSQL..."
    $pgCtl = Join-Path $pgBin "pg_ctl.exe"
    $log = Join-Path $tools "postgres.log"
    Start-Process -FilePath $pgCtl -ArgumentList "-D", $pgData, "-l", $log, "start", "-o", "-p 5432" -WindowStyle Hidden -Wait
    Start-Sleep -Seconds 3
    $createdb = Join-Path $pgBin "createdb.exe"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & $createdb -U aiops aiops 2>$null | Out-Null
    $ErrorActionPreference = $prevEap
}

# Redis
if (-not (Test-Port 6379)) {
    Write-Host "Starting Redis..."
    $pids += Start-Background "redis" $redisServer @() (Join-Path $tools "redis")
}

# MinIO
if (-not (Test-Port 9000)) {
    Write-Host "Starting MinIO..."
    $minioData = Join-Path $tools "minio-data"
    New-Item -ItemType Directory -Force -Path $minioData | Out-Null
    $env:MINIO_ROOT_USER = "minioadmin"
    $env:MINIO_ROOT_PASSWORD = "minioadmin"
    $minioDir = Join-Path $tools "minio"
    $pids += Start-Background "minio" $minioExe @("server", $minioData, "--address", ":9000", "--console-address", ":9001") $minioDir
}

Start-Sleep -Seconds 2

# Wait for Postgres (pg_ctl can return before TCP accepts connections)
$pgReady = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Test-Port 5432) { $pgReady = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $pgReady) {
    Write-Host "PostgreSQL failed to start - see tools\native\postgres.log" -ForegroundColor Red
    exit 1
}

# Init DB
Write-Host "Initializing database..."
$env:PYTHONPATH = Join-Path $root "backend"
Push-Location (Join-Path $root "backend")
& $venvPy scripts\init_db.py
Pop-Location

# API
if (-not (Test-Port 8000)) {
    Write-Host "Starting API..."
    $pids += Start-Background "api" $venvPy @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload") (Join-Path $root "backend")
}

Start-Sleep -Seconds 3

# Celery - one solo worker for all queues (Windows prefork hangs; two workers often lose training).
Write-Host "Starting Celery worker (all queues)..."
Start-Process -FilePath $venvPy -ArgumentList @(
    "-m", "celery", "-A", "workers.celery_app", "worker",
    "-P", "solo",
    "-Q", "ingestion,labeling,training,monitor,reports",
    "--prefetch-multiplier=1",
    "--loglevel=info",
    "-n", "native@%COMPUTERNAME%"
) -WorkingDirectory (Join-Path $root "backend") -WindowStyle Normal | Out-Null

$workerReady = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $out = & $venvPy -c @"
from celery import Celery
from app.core.config import get_settings
s = get_settings()
app = Celery(broker=s.celery_broker_url, backend=s.celery_result_backend)
stats = app.control.inspect().stats() or {}
print('ok' if stats else 'wait')
"@ 2>$null
    if ($out -match 'ok') { $workerReady = $true; break }
}
if ($workerReady) {
    Push-Location (Join-Path $root "backend")
    & $venvPy scripts\recover_stuck_training.py
    Pop-Location
} else {
    Write-Host "Celery worker not registered - run scripts\restart_workers_native.ps1" -ForegroundColor Yellow
}

# Frontend
if (-not (Test-Port 5173)) {
    Write-Host "Starting frontend..."
    $pids += Start-Background "frontend" "npm" @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") (Join-Path $root "frontend")
}

$pids | ConvertTo-Json | Set-Content $pidFile -Encoding UTF8

Write-Host ""
Write-Host "Native local app (no Docker):" -ForegroundColor Green
Write-Host "  UI:       http://localhost:5173"
Write-Host "  API:      http://localhost:8000/docs"
Write-Host "  MinIO UI: http://localhost:9001  (minioadmin / minioadmin)"
Write-Host "  Login:    admin@aiops.com / admin123"
Write-Host ""
Write-Host "Stop: scripts\stop_native.ps1"
