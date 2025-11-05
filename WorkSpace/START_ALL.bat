@echo off
echo ================================================
echo CoinRuler - Complete System Startup
echo ================================================
echo.

REM Kill any existing processes on ports 3000 and 3001
echo [1/4] Cleaning up existing processes...
netstat -ano | findstr :3000 > nul
if %ERRORLEVEL% == 0 (
    echo Killing process on port 3000...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a 2>nul
)

netstat -ano | findstr :3001 > nul
if %ERRORLEVEL% == 0 (
    echo Killing process on port 3001...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /F /PID %%a 2>nul
)

timeout /t 2 > nul

REM Load environment from root
echo [2/4] Setting environment variables from root .env...
cd /d C:\Users\Student\Desktop\CoinRuler
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        set %%a=%%b
    )
    echo Environment loaded successfully
) else (
    echo WARNING: .env file not found at root!
)

REM Start API in new window
echo [3/4] Starting API server on port 3001...
set PORT=3001
start "CoinRuler API" cmd /k "cd /d C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\api && node dist/index.js"

timeout /t 3 > nul

REM Start Web in new window
echo [4/4] Starting Web dashboard on port 3000...
set WEB_PORT=3000
set NEXT_PUBLIC_API_BASE=http://localhost:3001
start "CoinRuler Web" cmd /k "cd /d C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\web && npx next dev"

timeout /t 5 > nul

echo.
echo ================================================
echo ✓ All services started!
echo ================================================
echo API:       http://localhost:3001
echo Dashboard: http://localhost:3000
echo ================================================
echo.
echo Press any key to open dashboard in browser...
pause > nul

start http://localhost:3000

echo.
echo Services are running in separate windows.
echo Close those windows or press Ctrl+C to stop services.
echo.
pause
