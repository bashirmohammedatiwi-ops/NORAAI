# Start fully local NORAAI (separate DB/models from VPS). Requires Docker Desktop.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Find-Docker {
    $candidates = @(
        "docker",
        "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    )
    foreach ($c in $candidates) {
        if (Get-Command $c -ErrorAction SilentlyContinue) { return $c }
        if (Test-Path $c) { return $c }
    }
    return $null
}

$docker = Find-Docker
if (-not $docker) {
    Write-Host ""
    Write-Host "Docker Desktop is required for standalone local mode." -ForegroundColor Red
    Write-Host "Install: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "After install, restart PC, open Docker Desktop, then run this script again."
    Write-Host ""
    Write-Host "Alternative: use VPS at http://187.127.88.146:8080"
    exit 1
}

$standaloneFe = Join-Path $root "frontend\.env.standalone"
$feLocal = Join-Path $root "frontend\.env.local"
if (Test-Path $standaloneFe) {
    Copy-Item $standaloneFe $feLocal -Force
}

Write-Host "Starting standalone local stack (aiops-local)..." -ForegroundColor Cyan
Write-Host "  Data: separate volumes - NOT connected to VPS"
Write-Host ""

& $docker compose -f docker-compose.standalone.yml --env-file .env.standalone up -d --build

Write-Host "Waiting for API..."
$ready = $false
for ($i = 1; $i -le 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health/ready" -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        $null = $_
    }
    Start-Sleep -Seconds 3
}

if ($ready) {
    Write-Host "Initializing database (first run)..."
    & $docker compose -f docker-compose.standalone.yml --env-file .env.standalone exec -T api python scripts/init_db.py 2>$null
} else {
    Write-Host "API slow to start - check logs with docker compose -f docker-compose.standalone.yml logs api" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Standalone local app:" -ForegroundColor Green
Write-Host "  UI:        http://localhost:5173"
Write-Host "  API:       http://localhost:8000"
Write-Host "  API Docs:  http://localhost:8000/docs"
Write-Host "  MinIO:     http://localhost:9001  (minioadmin / minioadmin)"
Write-Host "  Login:     admin@aiops.com / admin123"
Write-Host ""
Write-Host "Stop: scripts/stop_standalone.ps1"
