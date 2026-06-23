# AI Signal Generator ⚡

A real-time, fully-functional AI signal generator for **any pair at all** —
crypto, forex majors, and commodities.  When you ask for a signal, it scans
**35 tradable pairs**, pulls **live OHLCV data**, fetches the latest
**60+ crypto/forex news headlines**, scores every pair on a multi-factor
model, and returns a **BUY / SELL signal** with **entry, take-profit and
stop-loss** for the **best pair at that moment**.

> 100 % free, no API keys, runs entirely on real-time public data.

## What it does

| Stage | What happens |
|-------|--------------|
| **1. Universe scan** | Iterates 20 crypto spot pairs (OKX, real-time) + 10 forex pairs, gold, silver, crude oil + BTC/ETH from Yahoo Finance |
| **2. OHLCV** | Pulls 220 hourly candles per pair (≈ 9 days) for indicator calculations |
| **3. Technical analysis** | RSI(14), MACD(12/26/9), EMA(20/50/200), Bollinger Bands, Stochastic, ADX, OBV, VWAP, ATR(14) |
| **4. News + sentiment** | Reads RSS feeds from CoinDesk, CoinTelegraph, Bitcoin.com, ForexLive, Investing.com, Yahoo Finance; runs VADER sentiment + bull/bear keyword boost; matched per-pair |
| **5. Scoring** | Each pair gets sub-scores: **technical (40 %) · momentum (20 %) · volume (15 %) · volatility (10 %) · sentiment (15 %)**. Composite 0-100. |
| **6. Best-pair pick** | Highest composite wins. Direction (BUY/SELL) decided by a 6-vote technical + sentiment panel. |
| **7. Trade levels** | Entry = current price. Stop-Loss = entry ∓ 0.75-1.0 × ATR. Take-Profit = entry ± 1.5-2.0 × ATR. Risk:Reward always ≥ 1.5. |

## Data sources (no API keys, real-time)

- **OKX** — `/api/v5/market/candles`, `/api/v5/market/ticker` — real-time spot crypto.
- **Yahoo Finance** (`yfinance`) — forex majors, gold, silver, crude oil. ~15 min delayed for FX.
- **Coinbase** + **CoinGecko** — last-price fallback if OKX fails.
- **RSS feeds** — six free feeds, parsed with `feedparser`, scored with VADER.

## Files

```
signal_engine.py   — core AI engine (data + indicators + scoring + signal builder)
app.py             — FastAPI web server (4 endpoints + serves the dashboard)
static/index.html  — dashboard markup
static/styles.css  — dark trading-desk theme
static/app.js      — fetch + render logic
requirements.txt   — Python deps
README.md          — this file
```

## Run

```bash
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:8000** in your browser.

You can also drive it from the command line:

```bash
python signal_engine.py    # prints full JSON to stdout
```

## API

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/api/health` | Health check |
| GET | `/api/universe` | List all 35 tradeable pairs |
| GET | `/api/signal` | **Best pair signal right now** (cached 30 s) |
| GET | `/api/signal?force=1` | Force fresh generation |
| GET | `/api/analyse/{symbol}` | Score a specific pair (e.g. `BTC-USDT`, `EURUSD=X`, `GC=F`) |

Example:
```bash
curl http://localhost:8000/api/signal | jq
curl http://localhost:8000/api/analyse/EURUSD%3DX | jq
```

## Sample response

```json
{
  "signal": {
    "pair": "TRX/USDT",
    "direction": "BUY",
    "confidence": 0.525,
    "entry": 0.32279,
    "take_profit": 0.32409,
    "stop_loss": 0.32214,
    "risk_reward": 2.0,
    "last_price": 0.32279,
    "change_24h_pct": 0.51,
    "composite_score": 65.0,
    "sentiment": -0.055,
    "indicators": {"rsi": 55.4, "macd_hist": 0.0001, "atr_pct": 0.27, ...},
    "rationale": ["EMA20 above EMA50", "Price above EMA200", "MACD histogram positive", ...],
    "news_headlines": [...],
    "generated_at": "2026-06-20 02:42:55 UTC"
  },
  "ranked_pairs": [ ...top 15... ],
  "universe_size": 35,
  "news_total": 68,
  "latency_ms": 10694
}
```

## How to extend

- **Add a pair** — append a tuple to `CRYPTO_UNIVERSE` or `FOREX_UNIVERSE` in
  `signal_engine.py`. The dashboard picks it up automatically.
- **Tune scoring weights** — adjust the `weights` dict in
  `TechnicalAnalyzer.score(...)`.
- **Add news sources** — push more `(name, url)` tuples into `NEWS_FEEDS`.

## Caveats

- Yahoo Finance FX is delayed ~15 min. For sub-second FX you need a
  paid feed (e.g. Polygon, OANDA).
- This is **not financial advice**. Always size positions and use
  your own risk management. Past indicator performance ≠ future
  results.
- Crypto markets are 24/7 — the engine picks the best opportunity
  every time you press **⟳ Refresh**.

## License

MIT — use, modify, ship.
