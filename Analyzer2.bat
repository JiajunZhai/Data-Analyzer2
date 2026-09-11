@echo off
setlocal
title Data Pivot Table - Dev Server

echo ============================================
echo   Data Pivot Table
echo   Dev Server - http://localhost:5173
echo ============================================
echo.

cd /d "%~dp0data-pivot-table"
if errorlevel 1 (
    echo [ERROR] Cannot find data-pivot-table directory
    pause & exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install from: https://nodejs.org/
    pause & exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

if not exist "node_modules" (
    echo [INFO] Dependencies missing, running npm install ...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause & exit /b 1
    )
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Dev server already running on port 5173, opening browser...
    start http://localhost:5173
    pause & exit /b 0
)

echo [INFO] Starting dev server, browser will open automatically...
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"
call npm run dev

pause
