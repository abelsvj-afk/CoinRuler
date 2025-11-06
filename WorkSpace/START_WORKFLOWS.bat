@echo off
REM Start the CoinRuler self-debugger workflow
cd /d "%~dp0"

REM Build workflows package
call npm run build -w packages/workflows

REM Run default workflow (self-debugger)
node packages/workflows/dist/cli/run-workflow.js

pause
