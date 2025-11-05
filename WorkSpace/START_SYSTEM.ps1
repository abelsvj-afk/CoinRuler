#!/usr/bin/env pwsh
# CoinRuler - Complete System Startup
# This script starts all services with proper environment configuration

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          CoinRuler Trading Bot - Startup              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to root directory
Set-Location "C:\Users\Student\Desktop\CoinRuler"

# Kill existing processes
Write-Host "[1/5] 🧹 Cleaning up existing processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Load environment variables from .env
Write-Host "[2/5] 📝 Loading environment from .env..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            # Write-Host "  ✓ $key" -ForegroundColor DarkGray
        }
    }
    Write-Host "  ✓ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "  ✗ WARNING: .env file not found!" -ForegroundColor Red
}

# Build services
Write-Host "[3/5] 🔨 Building API..." -ForegroundColor Yellow
Set-Location "WorkSpace\apps\api"
npm run build | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ API built successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ API build failed!" -ForegroundColor Red
    exit 1
}

Set-Location "C:\Users\Student\Desktop\CoinRuler"

# Start API
Write-Host "[4/5] 🚀 Starting API server on port 3001..." -ForegroundColor Yellow
$env:PORT = "3001"
$apiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\api'; node dist/index.js" -PassThru -WindowStyle Normal
Write-Host "  ✓ API started (PID: $($apiProcess.Id))" -ForegroundColor Green

Start-Sleep -Seconds 3

# Start Web
Write-Host "[5/5] 🌐 Starting Web dashboard on port 3000..." -ForegroundColor Yellow
$env:NEXT_PUBLIC_API_BASE = "http://localhost:3001"
$webProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\web'; npx next dev" -PassThru -WindowStyle Normal
Write-Host "  ✓ Web started (PID: $($webProcess.Id))" -ForegroundColor Green

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ✓ All Services Running!                  ║" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  API Server:    http://localhost:3001                 ║" -ForegroundColor White
Write-Host "║  Dashboard:     http://localhost:3000                 ║" -ForegroundColor White
Write-Host "║  Health Check:  http://localhost:3001/health          ║" -ForegroundColor White
Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  API PID:       $($apiProcess.Id.ToString().PadRight(38)) ║" -ForegroundColor DarkGray
Write-Host "║  Web PID:       $($webProcess.Id.ToString().PadRight(38)) ║" -ForegroundColor DarkGray
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Open browser
Write-Host "Opening dashboard in browser..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Services are running in separate windows." -ForegroundColor Yellow
Write-Host "Close those windows or press Ctrl+C to stop services." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit this window (services will continue running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
