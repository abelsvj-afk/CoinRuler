@echo off
echo Starting CoinRuler Web Dashboard on port 3000...
cd /d "%~dp0apps\web"
set NEXT_PUBLIC_API_BASE=http://localhost:3001
set PORT=3000
npx next dev
pause
