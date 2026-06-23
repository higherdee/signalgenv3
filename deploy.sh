#!/usr/bin/env bash
# ============================================================================
# SignalGen — One-command deploy to GitHub + Render
# Usage:  GH_TOKEN=ghp_xxx bash deploy.sh
# ============================================================================
set -e

REPO_NAME="signalgen"
GITHUB_USER="higherdee"

echo ""
echo "============================================================"
echo "  SignalGen — Deploy"
echo "============================================================"
echo ""

# 1. Check for GitHub token
if [ -z "$GH_TOKEN" ]; then
    echo "ERROR: Set GH_TOKEN environment variable first."
    echo "  Get one at: https://github.com/settings/tokens/new"
    echo "  Then run:  GH_TOKEN=ghp_xxx bash deploy.sh"
    exit 1
fi

# 2. Init repo if needed
if [ ! -d ".git" ]; then
    echo "[1/4] Initializing git repository..."
    git init -b main
    git config user.email "deploy@signalgen.local"
    git config user.name  "SignalGen Deploy"
fi

# 3. Commit everything
echo "[2/4] Adding and committing files..."
git add .
git commit -m "Deploy SignalGen" 2>/dev/null || git commit --allow-empty -m "Re-deploy"

# 4. Push to GitHub using the token
echo "[3/4] Pushing to GitHub..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GH_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
git push -u origin main --force 2>&1 | tail -5

# 5. Print next steps
echo ""
echo "[4/4] ✓ Pushed to GitHub!"
echo ""
echo "============================================================"
echo "  NEXT STEPS — finish deploy on Render (2 minutes)"
echo "============================================================"
echo ""
echo "1. Open: https://render.com/select-repo?type=web"
echo "2. Find and click:  ${GITHUB_USER}/${REPO_NAME}"
echo "3. Render will auto-detect render.yaml — just click:"
echo "     → 'Apply'"
echo "     → 'Create Web Service'"
echo "4. Wait ~3 minutes."
echo "5. Your permanent URL will be:"
echo "     → https://${REPO_NAME}-XXXX.onrender.com"
echo ""
echo "  (Bookmark that — it never expires.)"
echo ""
