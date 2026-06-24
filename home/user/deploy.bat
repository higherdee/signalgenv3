@echo off
REM ============================================================================
REM  SignalGen - Windows deploy to GitHub + Render
REM  Usage:  deploy.bat  (will ask for token)
REM  Or:     set GH_TOKEN=ghp_xxx ^&^& deploy.bat
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  SignalGen - Windows Deploy
echo ============================================================
echo.

REM ---- 1. Token -----------------------------------------------------------
if "%GH_TOKEN%"=="" (
    set /p GH_TOKEN="Enter your GitHub Personal Access Token (ghp_...): "
    if "!GH_TOKEN!"=="" (
        echo ERROR: No token provided. Get one at https://github.com/settings/tokens/new
        pause
        exit /b 1
    )
)

REM ---- 2. Init repo --------------------------------------------------------
if not exist ".git" (
    echo [1/4] Initializing git repository...
    git init -b main
    git config user.email "deploy@signalgen.local"
    git config user.name  "SignalGen Deploy"
) else (
    echo [1/4] git repo already initialized.
)

REM ---- 3. Commit -----------------------------------------------------------
echo [2/4] Adding files...
git add .

REM Use a sentinel file with timestamp so commit isn't a no-op
echo %DATE% %TIME% > .deploy-marker
git add .deploy-marker

git commit -m "Deploy SignalGen" >nul 2>&1
if !errorlevel! neq 0 (
    echo  (nothing new to commit, continuing...)
)

REM ---- 4. Push ------------------------------------------------------------
echo [3/4] Pushing to GitHub...

REM Strip any existing origin first
git remote remove origin >nul 2>&1

REM Set new origin with token in URL
git remote add origin "https://%GH_TOKEN%@github.com/higherdee/signalgen.git"

git push -u origin main --force
if !errorlevel! neq 0 (
    echo.
    echo ============================================================
    echo  PUSH FAILED
    echo ============================================================
    echo.
    echo Common reasons:
    echo   1. Token doesn't have 'repo' scope
    echo   2. Repo 'signalgen' doesn't exist on GitHub yet
    echo      ^- Create it first at https://github.com/new
    echo   3. Token is wrong / expired / revoked
    echo.
    echo After fixing, just run this script again.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  PUSHED TO GITHUB!
echo ============================================================
echo.
echo [4/4] Now go finish the deploy on Render:
echo.
echo   1. Open: https://render.com/select-repo?type=web
echo   2. Find: higherdee/signalgen
echo   3. Click it ^&^& press "Apply" then "Create Web Service"
echo   4. Wait ~3 minutes
echo.
echo Your PERMANENT URL will be:
echo   https://signalgen-XXXX.onrender.com
echo.
echo (Bookmark it - it never expires.)
echo.
pause
