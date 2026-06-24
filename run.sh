#!/usr/bin/env bash
# Quick launcher for the AI Signal Generator
set -e

# Install dependencies if missing
python3 -c "import fastapi, uvicorn, yfinance, feedparser, ta, vaderSentiment, pandas" 2>/dev/null || {
    echo "Installing dependencies..."
    pip3 install --quiet -r requirements.txt
}

# Run
exec python3 app.py
