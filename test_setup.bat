@echo off
REM ===============================================================
REM  Quick diagnostic — check if Python is properly set up
REM  Run this first if you're having trouble launching
REM ===============================================================

echo.
echo ============================================================
echo   Python Setup Diagnostic
echo ============================================================
echo.

echo --- Checking for python ...
where python 2>nul
if %errorlevel% neq 0 echo   python NOT found in PATH
echo.

echo --- Checking for python3 ...
where python3 2>nul
if %errorlevel% neq 0 echo   python3 NOT found in PATH
echo.

echo --- Checking for py launcher ...
where py 2>nul
if %errorlevel% neq 0 echo   py NOT found in PATH
echo.

echo --- Python versions ...
python --version 2>nul
python3 --version 2>nul
py --version 2>nul
echo.

echo --- If a version printed above, run that one. Examples:
echo     py app.py
echo     python app.py
echo.
echo --- If NONE printed, install Python from python.org and
echo     CHECK "Add Python to PATH" during installation.
echo.

pause
