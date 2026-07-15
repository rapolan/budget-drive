# start-dev.ps1 - Reliable dev server startup/shutdown
#
# Usage:
#   ./start-dev.ps1          # kill anything on 4000/5173, then start backend + frontend
#   ./start-dev.ps1 -Stop    # stop both dev servers

param(
    [switch]$Stop
)

function Stop-DevPort($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "Freed port $port" -ForegroundColor Green
    }
}

if ($Stop) {
    Write-Host "=== Stopping dev servers ===" -ForegroundColor Yellow
    Stop-DevPort 4000
    Stop-DevPort 5173
    Write-Host "Servers stopped." -ForegroundColor Green
    exit 0
}

Write-Host "=== Clearing port conflicts ===" -ForegroundColor Yellow
Stop-DevPort 4000
Stop-DevPort 5173
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
Write-Host ""
Write-Host "Run './start-dev.ps1 -Stop' to stop both servers." -ForegroundColor DarkGray
