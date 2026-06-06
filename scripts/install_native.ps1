# Download portable Redis, MinIO, PostgreSQL for native Windows (no Docker).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $root "tools\native"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Ensure-Download($url, $dest) {
    if (Test-Path $dest) { return }
    Write-Host "Downloading $url ..."
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

# Redis (Windows port)
$redisZip = Join-Path $tools "redis.zip"
$redisDir = Join-Path $tools "redis"
if (-not (Test-Path (Join-Path $redisDir "redis-server.exe"))) {
    Ensure-Download "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip" $redisZip
    if (Test-Path $redisDir) { Remove-Item $redisDir -Recurse -Force }
    Expand-Archive -Path $redisZip -DestinationPath $redisDir -Force
}

# MinIO
$minioDir = Join-Path $tools "minio"
New-Item -ItemType Directory -Force -Path $minioDir | Out-Null
$minioExe = Join-Path $minioDir "minio.exe"
if (-not (Test-Path $minioExe)) {
    Ensure-Download "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" $minioExe
}

# PostgreSQL binaries (portable)
$pgZip = Join-Path $tools "postgresql.zip"
$pgDir = Join-Path $tools "postgresql"
$pgBin = Join-Path $pgDir "bin"
if (-not (Test-Path (Join-Path $pgBin "pg_ctl.exe"))) {
    Write-Host "Downloading PostgreSQL binaries (~60 MB)..."
    Ensure-Download "https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip" $pgZip
    if (Test-Path $pgDir) { Remove-Item $pgDir -Recurse -Force }
    Expand-Archive -Path $pgZip -DestinationPath $tools -Force
    $extracted = Get-ChildItem $tools -Directory | Where-Object { $_.Name -like "pgsql*" } | Select-Object -First 1
    if ($extracted) {
        Rename-Item $extracted.FullName $pgDir -Force
    }
}

# Init PostgreSQL data directory once
$pgData = Join-Path $tools "pgdata"
if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
    Write-Host "Initializing PostgreSQL data directory..."
    $initdb = Join-Path $pgBin "initdb.exe"
    & $initdb -D $pgData -U aiops -A trust -E UTF8 --locale=C
}

Write-Host ""
Write-Host "Native dependencies ready in tools\native" -ForegroundColor Green
Write-Host "Next: scripts\start_native.ps1"
