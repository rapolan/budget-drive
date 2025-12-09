@echo off
echo ================================================
echo Starting Budget Driving School Development Servers
echo ================================================
echo.

cd /d "%~dp0..\backend"
echo Starting Backend Server (Port 3000)...
start "Backend Server" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul

cd /d "%~dp0..\frontend"
echo Starting Frontend Server (Port 5173)...
start "Frontend Server" cmd /k "npm run dev"

echo.
echo ================================================
echo Both servers are starting...
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
echo ================================================
echo.
echo Press any key to exit this window (servers will keep running)
pause >nul
