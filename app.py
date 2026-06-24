"""
AI Signal Generator — FastAPI server (v2)
============================================
Async endpoints, chart data, pair-on-demand, intelligent caching.

Run:
    python3 app.py
Then open http://localhost:8000
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from signal_engine import (get_engine, UNIVERSE, NewsSentiment, TA, Scoring,
                          _vote_panel, _decide_signal, _build_signal,
                          _round_price, SmartChatbot)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("web")

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    eng = get_engine()
    await eng.aclose()


app = FastAPI(title="AI Signal Generator", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
# gzip responses >500 bytes → ~70% smaller payloads, faster first-paint
app.add_middleware(GZipMiddleware, minimum_size=500)

_chatbot = SmartChatbot()

# Cache: top-signal (TTL 30 s) + per-pair chart (TTL 60 s)
_cache_top: Dict[str, Any] = {}
_cache_top_ts: float = 0.0
_cache_chart: Dict[str, Dict[str, Any]] = {}
_cache_news: Dict[str, Any] = {"data": [], "ts": 0.0}

CACHE_TTL_TOP = 30
CACHE_TTL_CHART = 60
CACHE_TTL_NEWS = 45


# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "universe_size": len(UNIVERSE),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
    }


@app.get("/api/universe")
async def universe() -> Dict[str, Any]:
    out = []
    for sym, label, klass, kw, kind in UNIVERSE:
        src = "OKX (real-time)" if kind == "okx" else "Yahoo Finance"
        out.append({"symbol": sym, "label": label,
                    "asset_class": klass, "source": src})
    return {"pairs": out, "count": len(out)}


# ---------------------------------------------------------------------------
async def _get_news() -> list:
    now = time.time()
    if _cache_news["data"] and (now - _cache_news["ts"]) < CACHE_TTL_NEWS:
        return _cache_news["data"]
    eng = get_engine()
    data = await eng.market.fetch_news()
    _cache_news["data"] = data
    _cache_news["ts"] = now
    return data


# ---------------------------------------------------------------------------
@app.get("/api/signal")
async def signal(force: bool = False) -> Dict[str, Any]:
    global _cache_top, _cache_top_ts
    now = time.time()
    if not force and _cache_top and (now - _cache_top_ts) < CACHE_TTL_TOP:
        log.info("cache hit (%.0fs old)", now - _cache_top_ts)
        out = dict(_cache_top)
        out["cached"] = True
        return out

    eng = get_engine()
    t0 = time.time()
    out = await eng.generate()
    out["latency_ms"] = int((time.time() - t0) * 1000)
    out["cached"] = False
    _cache_top = dict(out)
    _cache_top_ts = now
    return out


# ---------------------------------------------------------------------------
@app.get("/api/chart/{symbol:path}")
async def chart(symbol: str,
                interval: str = Query("1H", pattern="^(1m|3m|5m|15m|30m|1H|2H|4H|6H|12H|1D|1W)$"),
                limit: int = Query(200, ge=50, le=500)) -> Dict[str, Any]:
    key = f"{symbol}|{interval}|{limit}"
    now = time.time()
    if key in _cache_chart and (now - _cache_chart[key]["ts"]) < CACHE_TTL_CHART:
        c = dict(_cache_chart[key]["data"])
        c["cached"] = True
        return c
    eng = get_engine()
    try:
        data = await eng.chart(symbol, interval=interval, limit=limit)
        data["cached"] = False
        _cache_chart[key] = {"data": data, "ts": now}
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
@app.get("/api/analyse/{symbol:path}")
async def analyse(symbol: str, request: Request) -> Dict[str, Any]:
    """Generate a full signal for any specific pair."""
    # Find by symbol id or label
    target = None
    for entry in UNIVERSE:
        sym, label, klass, kw, kind = entry
        if sym == symbol or sym.replace("-", "") == symbol.replace("-", "") \
                or label.replace("/", "") == symbol.replace("/", "").upper() \
                or label == symbol:
            target = entry
            break
    if target is None:
        # Try to interpret as a free-form symbol (e.g. user typed "BTCUSDT")
        s = symbol.upper().replace("/", "")
        for entry in UNIVERSE:
            sym, label, klass, kw, kind = entry
            if s == sym.replace("-", ""):
                target = entry
                break

    if target is None:
        raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

    sym, label, klass, kw, kind = target
    eng = get_engine()

    # 1) Get chart (candles + indicators + trade levels)
    tf = request.query_params.get("interval", "1H")
    chart_data = await eng.chart(sym, interval=tf, limit=200)

    # 2) Build full signal for ranking display
    df = chart_data  # we already have everything
    candles = chart_data["candles"]
    last = candles[-1]["c"] if candles else 0.0

    news = await _get_news()
    sent_signed, sent_score, matched = NewsSentiment().score(label, kw, news)

    # Build a minimal PairScore for ranking
    from signal_engine import PairScore
    ind = chart_data["indicators"]
    subscores = chart_data["subscores"]
    bull_votes, bear_votes, rationale = _vote_panel(
        ind, ind, chart_data["trend"], chart_data["trend"], sent_signed
    )
    direction, conf, _ = _decide_signal(ind, bull_votes, bear_votes,
                                        chart_data["composite"], sent_signed)
    # Always synthesize a full TradeSignal via _build_signal
    ps = PairScore(
        symbol=sym, label=label, asset_class=klass,
        source=chart_data.get("source", ""),
        last_price=last,
        change_24h_pct=((last / candles[-25]["c"]) - 1) * 100 if len(candles) >= 25 else 0.0,
        composite=chart_data["composite"],
        trend_1h=chart_data["trend"], trend_4h=chart_data["trend"],
        technical=subscores["technical"], momentum=subscores["momentum"],
        volume=subscores["volume"], volatility=subscores["volatility"],
        sentiment=sent_signed, sentiment_score=subscores["sentiment"],
        bull_votes=bull_votes, bear_votes=bear_votes,
        confidence=conf,
        indicators=ind, notes=[direction],
    )
    signal = _build_signal(ps, news)
    return {
        "signal": signal.to_dict(),
        "chart": chart_data,
        "ranked_pairs": [{
            "symbol": sym, "label": label,
            "asset_class": klass, "source": ps.source,
            "last_price": round(last, 6),
            "change_24h_pct": round(ps.change_24h_pct, 2),
            "trend": ps.trend_1h,
            "composite": ps.composite,
            "technical": ps.technical, "momentum": ps.momentum,
            "volume": ps.volume, "volatility": ps.volatility,
            "sentiment": round(ps.sentiment, 3),
            "bull_votes": ps.bull_votes, "bear_votes": ps.bear_votes,
        }],
        "universe_size": 1,
        "news_total": len(news),
    }


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# AI Chatbot — chart-aware analyst (no external LLM API needed)
# ---------------------------------------------------------------------------
from pydantic import BaseModel
class ChatRequest(BaseModel):
    message: str
    history: list = []  # [{role: "user"|"assistant", content: "..."}]
    context: dict = {}  # {pair, signal, indicators}

@app.post("/api/chat")
async def chat(req: ChatRequest) -> Dict[str, Any]:
    """Smart chart-aware chatbot. No external API needed."""
    if not req.message.strip():
        return {"reply": "Say something — I'm listening.", "type": "empty"}
    # Build context from current signal/indicators
    ctx = dict(req.context or {})
    # For now: stateless but context-aware
    result = _chatbot.respond(req.message, ctx)
    return {
        "reply": result["reply"],
        "type": result.get("type", "response"),
        "topic": result.get("topic"),
        "context_pair": ctx.get("pair"),
    }


# Static + index
# ---------------------------------------------------------------------------
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def root() -> Any:
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return JSONResponse({"detail": "Frontend not built yet."})


# ---------------------------------------------------------------------------
# Download endpoint — serves a ZIP of the entire project so users can grab
# it from a phone and deploy it themselves later.
# ---------------------------------------------------------------------------
@app.get("/download")
async def download_zip() -> Any:
    import zipfile, io
    zip_path = BASE_DIR / "signalgen.zip"
    if not zip_path.exists():
        return JSONResponse({"error": "ZIP not built. Run `zip -r signalgen.zip ...` on server."}, status_code=404)
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename="signalgen.zip",
    )


if __name__ == "__main__":
    import uvicorn, os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
