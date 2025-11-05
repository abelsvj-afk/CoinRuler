@echo off
echo Starting CoinRuler API on port 3001...
cd /d "%~dp0apps\api"
set PORT=3001
node dist/index.js
pause
