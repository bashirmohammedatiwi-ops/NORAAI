# Stop standalone local stack.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker -and (Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe")) {
    $docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
}
if (-not $docker) {
    Write-Host "Docker not found." -ForegroundColor Red
    exit 1
}

& $docker compose -f docker-compose.standalone.yml --env-file .env.standalone down
Write-Host "Standalone stack stopped. Data kept in Docker volumes (aiops-local)." -ForegroundColor Green
