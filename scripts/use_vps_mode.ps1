# Switch frontend back to VPS (remote API).
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root "frontend\.env.local"
@"
VITE_API_URL=http://187.127.88.146:8080
VITE_WS_URL=ws://187.127.88.146:8080
"@ | Set-Content $envFile -Encoding UTF8
Write-Host "Frontend now points to VPS: http://187.127.88.146:8080" -ForegroundColor Green
Write-Host "Restart npm run dev if running."
