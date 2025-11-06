@echo off
REM Start all services for CoinRuler testing

echo Starting API server on port 3001...
cd apps\api
start "CoinRuler API" cmd /c "set API_PORT=3001 && node dist/index.js"

timeout /t 3 /nobreak > nul

echo Starting Web server on port 3000...
cd ..\web
start "CoinRuler Web" cmd /c "set PORT=3000 && set NEXT_PUBLIC_API_BASE=http://localhost:3001 && npx next start -p 3000"

timeout /t 5 /nobreak > nul

echo.
echo ✅ Services started!
echo    API: http://localhost:3001
echo    Web: http://localhost:3000
echo.
echo Press any key to run integration tests...
pause > nul

cd ..\..
node test-integration.js

echo.
echo Tests complete. Press any key to exit...
pause > nul
