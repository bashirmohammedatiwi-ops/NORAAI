# Build NORAAI portable Windows EXE (CPU + Intel iGPU DirectML).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "=== NORAAI Desktop Build ===" -ForegroundColor Cyan

# 1) Native services (Postgres, Redis, MinIO)
& (Join-Path $root "scripts\install_native.ps1")

# 2) Python venv + desktop deps (torch-directml for Intel iGPU)
$backend = Join-Path $root "backend"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Creating Python venv..."
    python -m venv (Join-Path $backend ".venv")
}
& $venvPy -m pip install --upgrade pip wheel
Write-Host "Installing desktop requirements (includes torch-directml)..."
& $venvPy -m pip install -r (Join-Path $backend "requirements-desktop.txt")

# 3) Frontend production build
$fe = Join-Path $root "frontend"
Copy-Item (Join-Path $root "frontend\.env.desktop") (Join-Path $fe ".env.production") -Force
Push-Location $fe
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

# 4) Bundle folder for electron-builder extraResources
$bundle = Join-Path $root "dist\norai-bundle"
if (Test-Path $bundle) { Remove-Item $bundle -Recurse -Force }
New-Item -ItemType Directory -Force -Path $bundle | Out-Null

Write-Host "Copying bundle..."
$exclude = @(".venv\Lib\site-packages\__pycache__", "*.pyc")
robocopy $backend (Join-Path $bundle "backend") /E /XD __pycache__ .pytest_cache /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
robocopy (Join-Path $root "tools\native") (Join-Path $bundle "tools\native") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
robocopy (Join-Path $fe "dist") (Join-Path $bundle "frontend\dist") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
Copy-Item (Join-Path $root ".env.desktop") (Join-Path $bundle ".env.desktop") -Force

# 5) Electron portable EXE
$desktop = Join-Path $root "desktop-app"
Push-Location $desktop
if (-not (Test-Path "node_modules")) { npm install }
npm run electron:build
Pop-Location

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Portable EXE: desktop-app\release\NORAAI-Portable-1.0.0.exe"
Write-Host ""
Write-Host "Performance tips:"
Write-Host "  - Uses TRAINING_DEVICE=auto (Intel iGPU via DirectML when available)"
Write-Host "  - Falls back to optimized CPU (all cores) if DirectML unavailable"
Write-Host "  - First launch may take 30-60s while services start"
