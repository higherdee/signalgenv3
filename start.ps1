# ===============================================================
#  AI Signal Generator — PowerShell launcher
#  Run from VS Code terminal:  .\start.ps1
# ===============================================================

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "============================================================"
Write-Host "  AI Signal Generator — Windows launcher (PowerShell)"
Write-Host "============================================================"
Write-Host ""

# 1. Find Python
$python = $null
foreach ($cmd in @('py', 'python', 'python3')) {
    try {
        $v = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $python = $cmd
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host "[ERROR] Python is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Fix: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "       Download Python 3.11 or 3.12"
    Write-Host "       CHECK 'Add Python to PATH' during install"
    Write-Host ""
    Write-Host "  OR disable Microsoft Store aliases:" -ForegroundColor Yellow
    Write-Host "     Settings > Apps > Advanced app settings > App execution aliases"
    Write-Host "     Turn OFF python.exe and python3.exe"
    Write-Host ""
    pause
    exit 1
}

Write-Host "[OK] Using Python: $python" -ForegroundColor Green
& $python --version
Write-Host ""

# 2. Install dependencies if needed
if (-not (Test-Path ".deps_installed")) {
    Write-Host "[INFO] First run — installing dependencies..." -ForegroundColor Cyan
    & $python -m pip install --upgrade pip | Out-Null
    & $python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] pip install failed." -ForegroundColor Red
        pause
        exit 1
    }
    "" | Out-File -Encoding ascii .deps_installed
    Write-Host "[OK] Dependencies installed." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[OK] Dependencies already installed (delete .deps_installed to reinstall)." -ForegroundColor Green
    Write-Host ""
}

# 3. Start server
Write-Host "[INFO] Starting AI Signal Generator on http://localhost:8000" -ForegroundColor Cyan
Write-Host "[INFO] Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host ""
& $python app.py
