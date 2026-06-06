# Local UI — connects to VPS API (data + models stay on VPS).
param(
    [string]$VpsUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $root "frontend"
$envLocal = Join-Path $root ".env.local-worker"

if (-not $VpsUrl -and (Test-Path $envLocal)) {
    Get-Content $envLocal | ForEach-Object {
        if ($_ -match '^VPS_HOST=(.+)$') { $VpsUrl = "http://$($Matches[1].Trim()):8080" }
    }
}

if (-not $VpsUrl -or $VpsUrl -match 'YOUR_VPS') {
    $VpsUrl = Read-Host "VPS URL (e.g. http://203.0.113.10:8080)"
}

$viteEnv = Join-Path $frontend ".env.local"
@"
VITE_API_URL=$VpsUrl
VITE_WS_URL=$($VpsUrl -replace '^http','ws')
"@ | Set-Content -Path $viteEnv -Encoding UTF8

Write-Host "Frontend -> $VpsUrl" -ForegroundColor Green
Write-Host "Open http://localhost:5173 after dev server starts"
Write-Host ""

Set-Location $frontend
if (-not (Test-Path "node_modules")) {
    npm install
}
npm run dev
