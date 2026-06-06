# One-time setup: Python venv + dependencies for local training worker.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
$venv = Join-Path $backend ".venv"

function Find-Python {
    foreach ($cmd in @("py -3.11", "py -3.12", "python3.11", "python")) {
        $parts = $cmd -split ' '
        $exe = $parts[0]
        $args = if ($parts.Length -gt 1) { $parts[1..99] } else { @() }
        if (Get-Command $exe -ErrorAction SilentlyContinue) {
            try {
                $ver = & $exe @args -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
                if ($ver -match '^3\.(11|12)$') { return @{ Exe = $exe; Args = $args } }
            } catch {}
        }
    }
    return $null
}

$py = Find-Python
if (-not $py) {
    Write-Host "Python 3.11 or 3.12 required (torch). Install from python.org" -ForegroundColor Red
    exit 1
}

Write-Host "Using Python: $($py.Exe) $($py.Args -join ' ')" -ForegroundColor Green
$ProgressPreference = 'Continue'

if (-not (Test-Path $venv)) {
    & $py.Exe @($py.Args + @("-m", "venv", $venv))
}

$pip = Join-Path $venv "Scripts\pip.exe"
$python = Join-Path $venv "Scripts\python.exe"

Write-Host "Installing backend requirements (may take several minutes)..."
& $pip install --upgrade pip wheel
& $pip install -r (Join-Path $backend "requirements.txt")

Write-Host ""
Write-Host "Setup complete. Next:" -ForegroundColor Green
Write-Host "  1. copy .env.local-worker.example -> .env.local-worker (fill VPS IP + passwords)"
Write-Host "  2. On VPS: bash scripts/enable_vps_remote_training.sh"
Write-Host "  3. scripts/tunnel_vps.ps1"
Write-Host "  4. scripts/start_local_training_worker.ps1"
