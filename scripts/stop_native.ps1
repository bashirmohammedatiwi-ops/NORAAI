# Stop native Windows stack.
$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $root "tools\native"
$pidFile = Join-Path $tools "native.pids.json"
$pgBin = Join-Path $tools "postgresql\bin"
$pgData = Join-Path $tools "pgdata"

if (Test-Path $pidFile) {
    $entries = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($e in $entries) {
        Stop-Process -Id $e.pid -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $($e.name) (pid $($e.pid))"
    }
    Remove-Item $pidFile -Force
}

$pgCtl = Join-Path $pgBin "pg_ctl.exe"
if (Test-Path $pgCtl) {
    & $pgCtl -D $pgData stop -m fast 2>$null
    Write-Host "Stopped PostgreSQL"
}

Write-Host "Done."
