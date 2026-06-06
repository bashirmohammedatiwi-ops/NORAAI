# SSH tunnel: VPS Postgres + Redis -> local ports for training worker.
# Keep this window open while training locally.
param(
    [string]$EnvFile = "$PSScriptRoot\..\.env.local-worker"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path $EnvFile)) {
    $example = Join-Path $root ".env.local-worker.example"
    Write-Host "Missing $EnvFile" -ForegroundColor Red
    Write-Host "Copy $example to .env.local-worker and set VPS_HOST + passwords."
    exit 1
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $vars[$k.Trim()] = $v.Trim()
}

$host_ = $vars['VPS_HOST']
$user = $vars['VPS_SSH_USER']
if (-not $host_) { $host_ = 'YOUR_VPS_IP' }
if (-not $user) { $user = 'root' }

if ($host_ -eq 'YOUR_VPS_IP') {
    Write-Host "Set VPS_HOST in .env.local-worker" -ForegroundColor Red
    exit 1
}

$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
    Write-Host "OpenSSH client not found. Install: Settings -> Apps -> Optional features -> OpenSSH Client" -ForegroundColor Red
    exit 1
}

Write-Host "Tunneling VPS $host_ -> local:" -ForegroundColor Cyan
Write-Host "  Postgres 127.0.0.1:15432"
Write-Host "  Redis    127.0.0.1:16379"
Write-Host "Press Ctrl+C to close tunnel."
Write-Host ""

& ssh -N `
    -o ServerAliveInterval=30 `
    -o ExitOnForwardFailure=yes `
    -L 15432:127.0.0.1:5432 `
    -L 16379:127.0.0.1:6379 `
    "${user}@${host_}"
