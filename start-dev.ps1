# start-dev.ps1 - Reliable dev server startup
# Kills any existing node processes first, then starts backend + frontend

Write-Host "=== Clearing port conflicts ===" -ForegroundColor Yellow
$port4000 = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($port4000) {
    Stop-Process -Id $port4000.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Freed port 4000" -ForegroundColor Green
}
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    Stop-Process -Id $port5173.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Freed port 5173" -ForegroundColor Green
}
Start-Sleep -Seconds 1

Write-Host "=== Starting Backend (port 4000) ===" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run dev" -WorkingDirectory "$PSScriptRoot"

Start-Sleep -Seconds 3

Write-Host "=== Starting Frontend (port 5173) ===" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WorkingDirectory "$PSScriptRoot"

Write-Host ""
Write-Host "=== Both servers starting! ===" -ForegroundColor Green
Write-Host "Backend:  http://localhost:4000" -ForegroundColor White
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Login:    http://localhost:5173/login" -ForegroundColor White
