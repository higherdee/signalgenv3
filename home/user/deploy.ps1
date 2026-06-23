# ============================================================================
#  SignalGen - PowerShell deploy to GitHub + Render
#  Usage:  .\deploy.ps1
#  Or:     $env:GH_TOKEN="ghp_xxx"; .\deploy.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "============================================================"
Write-Host "  SignalGen - PowerShell Deploy"
Write-Host "============================================================"
Write-Host ""

# 1. Token
if (-not $env:GH_TOKEN) {
    $secure = Read-Host "Enter your GitHub Personal Access Token (ghp_...)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::FreeBSTR($bstr)
    if (-not $env:GH_TOKEN) {
        Write-Host "ERROR: No token provided." -ForegroundColor Red
        Write-Host "Get one at https://github.com/settings/tokens/new"
        exit 1
    }
}

# 2. Init repo
if (-not (Test-Path ".git")) {
    Write-Host "[1/4] Initializing git repository..." -ForegroundColor Cyan
    git init -b main | Out-Null
    git config user.email "deploy@signalgen.local"
    git config user.name  "SignalGen Deploy"
} else {
    Write-Host "[1/4] git repo already initialized." -ForegroundColor Green
}

# 3. Commit
Write-Host "[2/4] Adding files..." -ForegroundColor Cyan
git add .
"$env:USERNAME at $(Get-Date -Format 'o')" | Out-File .deploy-marker -Encoding ascii
git add .deploy-marker
git commit -m "Deploy SignalGen" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  (nothing new to commit, continuing...)" }

# 4. Push
Write-Host "[3/4] Pushing to GitHub..." -ForegroundColor Cyan
git remote remove origin 2>$null | Out-Null
git remote add origin "https://$($env:GH_TOKEN)@github.com/higherdee/signalgen.git"

try {
    git push -u origin main --force 2>&1 | Select-Object -Last 5
} catch {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  PUSH FAILED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common reasons:"
    Write-Host "  1. Token doesn't have 'repo' scope"
    Write-Host "  2. Repo 'signalgen' doesn't exist on GitHub yet"
    Write-Host "       ^- Create it first at https://github.com/new"
    Write-Host "  3. Token is wrong / expired / revoked"
    Write-Host ""
    Write-Host "After fixing, just run this script again."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  PUSHED TO GITHUB!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[4/4] Now go finish the deploy on Render:"
Write-Host ""
Write-Host "  1. Open: https://render.com/select-repo?type=web" -ForegroundColor Yellow
Write-Host "  2. Find: higherdee/signalgen" -ForegroundColor Yellow
Write-Host "  3. Click it & press Apply, then Create Web Service" -ForegroundColor Yellow
Write-Host "  4. Wait ~3 minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "Your PERMANENT URL will be:"
Write-Host "  https://signalgen-XXXX.onrender.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "(Bookmark it - it never expires.)" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
