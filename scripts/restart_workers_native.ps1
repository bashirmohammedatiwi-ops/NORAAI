# Restart Celery on Windows (fixes stuck queue / missing training worker).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
$py = Join-Path $backend ".venv\Scripts\python.exe"

Get-CimInstance Win32_Process -Filter "name='python.exe'" |
    Where-Object { $_.CommandLine -match 'celery' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

Copy-Item (Join-Path $root ".env.native") (Join-Path $backend ".env") -Force

# Clear stuck unacked tasks
& $py -c @"
import redis
r = redis.Redis(host='127.0.0.1', port=6379, db=1)
r.delete('unacked', 'unacked_index')
print('cleared unacked')
"@

Start-Process $py -ArgumentList @(
    "-m", "celery", "-A", "workers.celery_app", "worker",
    "-P", "solo",
    "-Q", "ingestion,labeling,training,monitor,reports",
    "--prefetch-multiplier=1",
    "--loglevel=info",
    "-n", "native@%COMPUTERNAME%"
) -WorkingDirectory $backend -WindowStyle Normal

$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $out = & $py -c @"
from celery import Celery
from app.core.config import get_settings
s = get_settings()
app = Celery(broker=s.celery_broker_url, backend=s.celery_result_backend)
stats = app.control.inspect().stats() or {}
print('ok' if stats else 'wait')
"@ 2>$null
    if ($out -match 'ok') { $ready = $true; break }
}
if (-not $ready) {
    Write-Host "Worker process started but not registered yet - check the Celery window for errors." -ForegroundColor Yellow
} else {
    Write-Host "Worker registered." -ForegroundColor Green
    Push-Location $backend
    & $py scripts\recover_stuck_training.py
    Pop-Location
}

Write-Host "Done. Exporting 2000 images can take 1-2 minutes before progress moves past 0%." -ForegroundColor Green
