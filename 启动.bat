@echo off
chcp 65001 >nul
title Data Pivot Table

echo ========================================
echo   Data Pivot Table - Quick Start
echo ========================================
echo.

:: 1. Check Node.js
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js not found
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo       Node.js %NODE_VERSION% installed
echo.

:: 2. Enter project directory
echo [2/5] Entering project directory...
cd /d "%~dp0data-pivot-table"
if errorlevel 1 (
    echo Error: data-pivot-table directory not found
    pause
    exit /b 1
)
echo       Current: %CD%
echo.

:: 3. Clean mode
if "%1"=="clean" (
    echo [3/5] Cleaning node_modules...
    if exist "node_modules" (
        rmdir /s /q "node_modules"
        echo       Deleted node_modules
    )
    if exist "package-lock.json" (
        del "package-lock.json"
        echo       Deleted package-lock.json
    )
    echo.
)

:: 4. Install dependencies
echo [4/5] Installing dependencies...
if exist "node_modules" (
    echo       node_modules exists, skipping
) else (
    call npm install
    if errorlevel 1 (
        echo Error: npm install failed
        pause
        exit /b 1
    )
    echo       Dependencies installed
)
echo.

:: 5. Start dev server
echo [5/5] Starting dev server...
echo.
echo ========================================
echo   Success!
echo   Visit: http://localhost:5173/
echo   Press Ctrl+C to stop
echo ========================================
echo.

:: Open browser
start http://localhost:5173/

call npm run dev
