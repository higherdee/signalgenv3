@echo off
REM ===============================================================
REM  AI Signal Generator — Windows launcher
REM  Double-click this file or run from VS Code terminal:
REM      .\start.bat
REM ===============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo   AI Signal Generator — Windows launcher
echo ============================================================
echo.

REM -- 1. Find Python --------------------------------------------------
set PYTHON=
for %%P in (py python python3) do (
    %%P --version >nul 2>&1
    if !errorlevel! equ 0 (
        set PYTHON=%%P
        goto :found
    )
)

echo [ERROR] Python is not installed.
echo.
echo   Fix: Go to https://www.python.org/downloads/
echo        Download Python 3.11 or 3.12
echo        CHECK "Add Python to PATH" during install
echo.
echo   OR:  Settings ^> Apps ^> Advanced app settings ^> App execution aliases
echo        Disable python.exe and python3.exe
echo.
pause
exit /b 1

:found
echo [OK] Using Python:  !PYTHON!
!PYTHON! --version
echo.

REM -- 2. Install deps on first run ------------------------------------
if not exist ".deps_installed" (
    echo [INFO] First run — installing dependencies (this takes ~1 minute)...
    !PYTHON! -m pip install --upgrade pip >nul 2>&1
    !PYTHON! -m pip install -r requirements.txt
    if !errorlevel! neq 0 (
        echo [ERROR] pip install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo. > .deps_installed
    echo [OK] Dependencies installed.
    echo.
) else (
    echo [OK] Dependencies already installed (delete .deps_installed to reinstall).
    echo.
)

REM -- 3. Start server --------------------------------------------------
echo [INFO] Starting AI Signal Generator on http://localhost:8000
echo [INFO] Press Ctrl+C to stop.
echo.
!PYTHON! app.py

endlocal
