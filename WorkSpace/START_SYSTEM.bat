@echo off
echo.
echo ================================
echo   CoinRuler System Startup
echo ================================
echo.

cd /d "%~dp0"

echo [1/3] Starting API Server...
start "CoinRuler API" cmd /k "cd apps\api && node start-api-3001.js"
timeout /t 3 /nobreak >nul

echo [2/3] Starting Discord Bot...
start "CoinRuler Bot" cmd /k "npm run dev -w apps/bot"
timeout /t 2 /nobreak >nul

echo [3/3] Starting Web Dashboard...
start "CoinRuler Web" cmd /k "npm run dev -w apps/web"

echo.
echo ================================
echo   All services started!
echo ================================
echo.
echo API:       http://localhost:3001/health
echo Web:       http://localhost:3000
echo Bot:       Check Discord
echo.
echo Close this window to keep services running.
echo.
pause
