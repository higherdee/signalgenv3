// =====================================================================
//  SignalGen - frontend v4 (FULL FEATURES)
//  • 12 timeframes (1m, 3m, 5m, 15m, 30m, 1H, 4H, 1D)
//  • FVG, BOS, Order Blocks, Liquidity Sweeps on chart
//  • AI Chatbot panel with quick questions and chart-aware analysis
//  • Smart auto-refresh: stays on selected pair, doesn't jump back
//  • gzip-compressed, fast first paint
// =====================================================================

const $ = (id) => document.getElementById(id);
const fmt = {
  price(p, ref) {
    if (p == null || isNaN(p)) return "-";
    const n = Number(p), r = ref != null ? Math.abs(ref) : n;
    if (r >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (r >= 10)   return n.toFixed(4);
    if (r >= 1)    return n.toFixed(4);
    if (r >= 0.01) return n.toFixed(6);
    return n.toFixed(8);
  },
  pct(p)  { if (p == null || isNaN(p)) return "-"; return (p >= 0 ? "+" : "") + p.toFixed(2) + "%"; },
  signed(p, d = 3) { if (p == null || isNaN(p)) return "-"; return (p >= 0 ? "+" : "") + p.toFixed(d); },
  time(t) {
    const d = new Date(t);
    const W = window.innerWidth;
    return d.toLocaleString("en-US", W < 600
      ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  },
};
const esc = (s) => (s == null || s === undefined ? "" : String(s).replace(/[&<>"']/g, m => (
  { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])));
function mdLite(t) {
  return t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
          .replace(/\*(.+?)\*/g, "<i>$1</i>")
          .replace(/`(.+?)`/g, "<code>$1</code>")
          .replace(/\n/g, "<br>");
}

const state = {
  universe: [],
  lastUpdate: 0,
  currentSymbol: null,
  currentInterval: "1H",
  isLoading: false,
  chart: null,
  showEma: true, showBb: true, showMarkers: true, showLevels: true,
  showFvg: true, showBos: true, showOb: false, showSweeps: false,
  chatOpen: false, chatHistory: [],
  autoRefreshTimer: null, _chatContext: {},
};

function setStatus(text, kind, latency) {
  $("status-text").textContent = text;
  $("status-lat").textContent = latency ? " " + latency + " ms" : "";
  $("status-dot").className = "status-dot" + (kind ? " " + kind : "");
}

async function loadUniverse() {
  try {
    const r = await fetch("/api/universe");
    const d = await r.json();
    state.universe = d.pairs || [];
  } catch (e) { console.error("universe load failed", e); }
}

function showSuggestions(q) {
  const box = $("pair-suggestions");
  q = (q || "").trim().toLowerCase();
  if (!q) { box.classList.remove("show"); return; }
  const matches = state.universe.filter(p =>
    p.label.toLowerCase().includes(q) || p.symbol.toLowerCase().includes(q) ||
    p.asset_class.toLowerCase().includes(q)).slice(0, 12);
  if (!matches.length) {
    box.innerHTML = '<div class="suggestion muted"><span class="s-label">No matches</span></div>';
  } else {
    const groups = {};
    matches.forEach(m => { (groups[m.asset_class] = groups[m.asset_class] || []).push(m); });
    let html = "";
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="suggestion group-header">${esc(cat)}</div>`;
      for (const p of items) {
        html += `<div class="suggestion" data-sym="${esc(p.symbol)}">
          <span class="s-label">${esc(p.label)}</span>
          <span class="s-meta">${esc(p.source.split(" ")[0])}</span>
          <span class="s-cat">${esc(p.asset_class)}</span></div>`;
      }
    }
    box.innerHTML = html;
    box.querySelectorAll(".suggestion[data-sym]").forEach(el => {
      el.addEventListener("click", () => {
        const sym = el.dataset.sym;
        $("pair-search").value = el.querySelector(".s-label").textContent;
        box.classList.remove("show");
        analyseSymbol(sym);
      });
    });
  }
  box.classList.add("show");
}

async function fetchSignal(force = false) {
  if (state.isLoading) return;
  state.isLoading = true;
  $("refresh-btn").disabled = true;
  setStatus("Loading...", "");
  try {
    const t0 = performance.now();
    const r = await fetch("/api/signal" + (force ? "?force=1" : ""));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    state.currentSymbol = data.signal.pair;
    state.currentInterval = "1H";
    syncTimeframeButtons();
    renderSignal(data);
    renderChart(data.chart);
    renderRanking(data.ranked_pairs || []);
    setStatus("Live", "live", data.latency_ms);
    state.lastUpdate = Date.now();
    scheduleAutoRefresh();
  } catch (e) {
    console.error(e);
    setStatus("Error: " + e.message, "err");
  } finally {
    state.isLoading = false;
    $("refresh-btn").disabled = false;
  }
}

async function analyseSymbol(symbol) {
  if (state.isLoading) return;
  state.isLoading = true;
  $("refresh-btn").disabled = true;
  setStatus(`Loading ${symbol}...`, "");
  try {
    const r = await fetch(`/api/analyse/${encodeURIComponent(symbol)}?interval=${state.currentInterval}`);
    if (!r.ok) throw new Error("HTTP " + r.status + " - " + (await r.text()).slice(0, 120));
    const data = await r.json();
    state.currentSymbol = data.signal.pair;
    renderSignal(data, true);
    renderChart(data.chart);
    setStatus("Live", "live");
    state.lastUpdate = Date.now();
    scheduleAutoRefresh();
  } catch (e) {
    console.error(e);
    setStatus("Error: " + e.message, "err");
  } finally {
    state.isLoading = false;
    $("refresh-btn").disabled = false;
  }
}

function renderSignal(data, isSpecific = false) {
  const sig = data.signal;
  $("s-pair").textContent = sig.pair;
  $("s-class").textContent = sig.asset_class;
  $("s-mtf").textContent = "MTF " + sig.multi_tf_agreement + "/2";
  const dir = sig.direction || "NEUTRAL";
  const badge = $("direction-badge");
  badge.textContent = dir;
  badge.className = "badge " + dir.toLowerCase();
  $("s-conf").textContent = (sig.confidence * 100).toFixed(1) + "%";
  $("s-conf-bar").style.width = (sig.confidence * 100).toFixed(0) + "%";
  $("s-entry").textContent = fmt.price(sig.entry, sig.last_price);
  $("s-tp").textContent = fmt.price(sig.take_profit, sig.last_price);
  $("s-sl").textContent = fmt.price(sig.stop_loss, sig.last_price);
  $("s-rr").textContent = "1:" + sig.risk_reward.toFixed(1);
  $("s-last").textContent = fmt.price(sig.last_price);
  const ch = sig.change_24h_pct;
  const chEl = $("s-24h");
  chEl.textContent = fmt.pct(ch);
  chEl.style.color = ch >= 0 ? "var(--bull)" : "var(--bear)";
  const ul = $("s-rationale");
  ul.innerHTML = "";
  sig.rationale.forEach(r => { const li = document.createElement("li"); li.textContent = r; ul.appendChild(li); });
  renderIndicators(sig.indicators);
  state._chatContext = { pair: sig.pair, signal: sig, indicators: sig.indicators || {} };
  $("chart-symbol").textContent = sig.pair;
  $("chart-meta").textContent = state.currentInterval + " · " + sig.asset_class;
  if (data.ranked_pairs && data.ranked_pairs.length > 1) {
    renderRanking(data.ranked_pairs);
    $("ranking-panel").classList.remove("hidden");
  } else {
    $("ranking-panel").classList.add("hidden");
  }
}

function renderIndicators(ind) {
  const cells = [
    { label: "RSI (14)", val: ind.rsi, fmt: v => v.toFixed(1),
      cls: v => v > 70 ? "bear" : v < 30 ? "bull" : (v >= 55 && v <= 70 ? "bull" : "") },
    { label: "MACD Hist", val: ind.macd_hist, fmt: v => v.toFixed(5),
      cls: v => v > 0 ? "bull" : "bear" },
    { label: "EMA 20", val: ind.ema20, fmt: v => fmt.price(v) },
    { label: "EMA 50", val: ind.ema50, fmt: v => fmt.price(v) },
    { label: "EMA 200", val: ind.ema200, fmt: v => fmt.price(v) },
    { label: "ATR %", val: ind.atr_pct, fmt: v => v.toFixed(2) + "%",
      cls: v => v >= 0.4 && v <= 3 ? "bull" : "warn" },
    { label: "Stoch K", val: ind.stoch_k, fmt: v => v.toFixed(1),
      cls: v => v > 80 ? "bear" : v < 20 ? "bull" : "" },
    { label: "ADX", val: ind.adx, fmt: v => v.toFixed(1),
      cls: v => v >= 25 ? "bull" : "" },
    { label: "Bollinger Hi", val: ind.bb_high, fmt: v => fmt.price(v) },
    { label: "Bollinger Lo", val: ind.bb_low, fmt: v => fmt.price(v) },
    { label: "VWAP", val: ind.vwap, fmt: v => fmt.price(v) },
    { label: "1h ret", val: ind.ret_1h, fmt: v => fmt.pct(v),
      cls: v => v >= 0 ? "bull" : "bear" },
    { label: "4h ret", val: ind.ret_4h, fmt: v => fmt.pct(v),
      cls: v => v >= 0 ? "bull" : "bear" },
    { label: "24h ret", val: ind.ret_24h, fmt: v => fmt.pct(v),
      cls: v => v >= 0 ? "bull" : "bear" },
  ];
  const grid = $("ind-grid");
  grid.innerHTML = "";
  cells.forEach(c => {
    if (c.val == null || isNaN(c.val)) return;
    const div = document.createElement("div");
    div.className = "ind-cell";
    const cls = c.cls ? c.cls(c.val) : "";
    div.innerHTML = `<span class="label">${c.label}</span><span class="value ${cls}">${c.fmt(c.val)}</span>`;
    grid.appendChild(div);
  });
}

function renderRanking(rows) {
  const body = $("rank-body");
  body.innerHTML = "";
  if (!rows || !rows.length) return;
  $("rank-meta").textContent = rows.length + " pairs · click to analyse";
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (r.label === state.currentSymbol) tr.classList.add("active");
    const trendCls = r.trend === "UP" ? "trend-up" : r.trend === "DOWN" ? "trend-down" : "trend-side";
    const ch = r.change_24h_pct;
    const chCol = ch >= 0 ? "color:var(--bull)" : "color:var(--bear)";
    tr.innerHTML = `
      <td>${i+1}</td><td><strong>${esc(r.label)}</strong></td>
      <td><span class="chip">${esc(r.asset_class)}</span></td>
      <td class="num">${fmt.price(r.last_price)}</td>
      <td class="num" style="${chCol}">${fmt.pct(ch)}</td>
      <td><span class="${trendCls}">${esc(r.trend)}</span></td>
      <td class="num"><strong>${r.composite.toFixed(1)}</strong></td>
      <td class="num">${r.bull_votes}/${r.bear_votes}</td>
      <td class="num" style="color:${r.sentiment >= 0 ? 'var(--bull)' : 'var(--sell)'}">${fmt.signed(r.sentiment, 2)}</td>`;
    tr.addEventListener("click", () => { $("pair-search").value = r.label; analyseSymbol(r.symbol); });
    body.appendChild(tr);
  });
}

// --- CandleChart with FVG, BOS, OB, Sweeps ---
class CandleChart {
  constructor(host) {
    this.host = host;
    this.tooltip = $("chart-tooltip");
    this.data = null;
    this.padding = { top: 16, right: 70, bottom: 28, left: 8 };
    this._ro = null;
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => { if (this.data) this._draw(); });
      this._ro.observe(this.host);
    }
  }
  render(data) { this.data = data; this._draw(); }
  _draw() {
    const host = this.host;
    host.querySelectorAll(".skeleton-chart, svg").forEach(el => el.remove());
    if (!this.data || !this.data.candles || !this.data.candles.length) {
      const sk = document.createElement("div");
      sk.className = "skeleton-chart";
      sk.innerHTML = `<div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div>`;
      host.appendChild(sk);
      return;
    }
    const W = host.clientWidth || 800, H = host.clientHeight || 460;
    const { top, right, bottom, left } = this.padding;
    const innerW = W - left - right, innerH = H - top - bottom;
    const c = this.data.candles, n = c.length;
    if (innerW <= 0 || innerH <= 0) return;

    let minP = Math.min(...c.map(k => k.l));
    let maxP = Math.max(...c.map(k => k.h));
    if (state.showBb && this.data.bb_high && this.data.bb_low) {
      this.data.bb_high.forEach(v => { if (v != null) maxP = Math.max(maxP, v); });
      this.data.bb_low.forEach(v => { if (v != null) minP = Math.min(minP, v); });
    }
    if (state.showFvg && this.data.fvg) {
      this.data.fvg.forEach(f => { maxP = Math.max(maxP, f.top); minP = Math.min(minP, f.bottom); });
    }
    if (state.showOb && this.data.order_blocks) {
      this.data.order_blocks.forEach(o => { maxP = Math.max(maxP, o.top); minP = Math.min(minP, o.bottom); });
    }
    const pad = (maxP - minP) * 0.05 || maxP * 0.001;
    const yMin = minP - pad, yMax = maxP + pad;
    const xStep = innerW / n;
    const candleW = Math.max(2, Math.min(14, xStep * 0.7));
    const yScale = (p) => top + innerH - ((p - yMin) / (yMax - yMin)) * innerH;
    const xScale = (i) => left + i * xStep + xStep / 2;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    // Gridlines
    for (let i = 0; i <= 5; i++) {
      const y = top + (innerH * i / 5);
      const p = yMax - (yMax - yMin) * (i / 5);
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", left); ln.setAttribute("x2", W - right);
      ln.setAttribute("y1", y); ln.setAttribute("y2", y);
      ln.setAttribute("stroke", "#21262d"); ln.setAttribute("stroke-dasharray", "2 4");
      svg.appendChild(ln);
      const tx = document.createElementNS(SVG_NS, "text");
      tx.setAttribute("x", W - right + 6); tx.setAttribute("y", y + 4);
      tx.setAttribute("fill", "#768390"); tx.setAttribute("font-size", "10");
      tx.setAttribute("font-family", "JetBrains Mono, monospace");
      tx.textContent = fmt.price(p, p);
      svg.appendChild(tx);
    }

    // Bollinger
    if (state.showBb && this.data.bb_high && this.data.bb_low) {
      let hiPts = "", loPts = "";
      for (let i = 0; i < n; i++) {
        const vh = this.data.bb_high[i], vl = this.data.bb_low[i];
        if (vh != null && vl != null) {
          hiPts += xScale(i) + "," + yScale(vh) + " ";
          loPts += xScale(i) + "," + yScale(vl) + " ";
        }
      }
      [hiPts, loPts].forEach(pts => {
        const pl = document.createElementNS(SVG_NS, "polyline");
        pl.setAttribute("points", pts); pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", "#58a6ff"); pl.setAttribute("stroke-width", "1");
        pl.setAttribute("stroke-dasharray", "2 3"); pl.setAttribute("opacity", "0.4");
        svg.appendChild(pl);
      });
    }

    // FVG zones
    if (state.showFvg && this.data.fvg) {
      this.data.fvg.forEach(f => {
        if (f.i_start < 0 || f.i_end < 0 || f.i_start >= n || f.i_end >= n) return;
        const x1 = xScale(f.i_start), x2 = xScale(f.i_end);
        const y1 = yScale(f.top), y2 = yScale(f.bottom);
        const isBull = f.type === "bull";
        const color = isBull ? "#3fb950" : "#f85149";
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", x1);
        rect.setAttribute("y", Math.min(y1, y2));
        rect.setAttribute("width", x2 - x1);
        rect.setAttribute("height", Math.abs(y2 - y1));
        rect.setAttribute("fill", color); rect.setAttribute("fill-opacity", "0.12");
        rect.setAttribute("stroke", color); rect.setAttribute("stroke-width", "0.6");
        rect.setAttribute("stroke-dasharray", "2 2");
        svg.appendChild(rect);
        // Extend to right
        const ext = document.createElementNS(SVG_NS, "rect");
        ext.setAttribute("x", x2); ext.setAttribute("y", Math.min(y1, y2));
        ext.setAttribute("width", W - right - x2 + 4);
        ext.setAttribute("height", Math.abs(y2 - y1));
        ext.setAttribute("fill", color); ext.setAttribute("fill-opacity", "0.06");
        svg.appendChild(ext);
      });
    }

    // Order Blocks
    if (state.showOb && this.data.order_blocks) {
      this.data.order_blocks.forEach(o => {
        if (o.i < 0 || o.i >= n) return;
        const x = xScale(o.i);
        const y1 = yScale(o.top), y2 = yScale(o.bottom);
        const isBull = o.type === "bull";
        const color = isBull ? "#3fb950" : "#f85149";
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", x - candleW / 2);
        rect.setAttribute("y", Math.min(y1, y2));
        rect.setAttribute("width", candleW * 3);
        rect.setAttribute("height", Math.abs(y2 - y1));
        rect.setAttribute("fill", color); rect.setAttribute("fill-opacity", "0.18");
        rect.setAttribute("stroke", color); rect.setAttribute("stroke-width", "0.8");
        svg.appendChild(rect);
      });
    }

    // EMAs
    if (state.showEma) {
      const drawLine = (arr, color) => {
        if (!arr || !arr.length) return;
        let pts = "";
        for (let i = 0; i < n; i++) {
          const v = arr[i];
          if (v != null) pts += xScale(i) + "," + yScale(v) + " ";
        }
        const pl = document.createElementNS(SVG_NS, "polyline");
        pl.setAttribute("points", pts); pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", color); pl.setAttribute("stroke-width", "1.5");
        pl.setAttribute("opacity", "0.85");
        svg.appendChild(pl);
      };
      drawLine(this.data.ema20, "#3fb950");
      drawLine(this.data.ema50, "#d29922");
      drawLine(this.data.ema200, "#58a6ff");
    }

    // Candles
    c.forEach((k, i) => {
      const x = xScale(i);
      const up = k.c >= k.o;
      const color = up ? "#3fb950" : "#f85149";
      const wick = document.createElementNS(SVG_NS, "line");
      wick.setAttribute("x1", x); wick.setAttribute("x2", x);
      wick.setAttribute("y1", yScale(k.h)); wick.setAttribute("y2", yScale(k.l));
      wick.setAttribute("stroke", color); wick.setAttribute("stroke-width", "1");
      svg.appendChild(wick);
      const bodyTop = Math.min(yScale(k.o), yScale(k.c));
      const bodyH = Math.max(1, Math.abs(yScale(k.c) - yScale(k.o)));
      const body = document.createElementNS(SVG_NS, "rect");
      body.setAttribute("x", x - candleW / 2);
      body.setAttribute("y", bodyTop);
      body.setAttribute("width", candleW); body.setAttribute("height", bodyH);
      body.setAttribute("fill", color); body.setAttribute("stroke", color);
      body.setAttribute("stroke-width", "0.8");
      svg.appendChild(body);
    });

    // BOS markers
    if (state.showBos && this.data.bos) {
      this.data.bos.forEach(b => {
        if (b.i < 0 || b.i >= n) return;
        const x = xScale(b.i);
        const y = yScale(b.price);
        const isBull = b.type === "bull";
        const color = isBull ? "#3fb950" : "#f85149";
        const tri = document.createElementNS(SVG_NS, "polygon");
        const triSize = 7;
        if (isBull) {
          tri.setAttribute("points", x + "," + (y - triSize) + " " + (x - triSize/2) + "," + (y + triSize*1.5) + " " + (x + triSize/2) + "," + (y + triSize*1.5));
        } else {
          tri.setAttribute("points", x + "," + (y + triSize) + " " + (x - triSize/2) + "," + (y - triSize*1.5) + " " + (x + triSize/2) + "," + (y - triSize*1.5));
        }
        tri.setAttribute("fill", color); tri.setAttribute("opacity", "0.9");
        svg.appendChild(tri);
      });
    }

    // Sweeps
    if (state.showSweeps && this.data.liquidity_sweeps) {
      this.data.liquidity_sweeps.forEach(s => {
        if (s.i < 0 || s.i >= n) return;
        const x = xScale(s.i);
        const y = yScale(s.level);
        const isBull = s.type === "bull";
        const color = isBull ? "#26d782" : "#ff6b6b";
        const r = 5;
        const dia = document.createElementNS(SVG_NS, "polygon");
        dia.setAttribute("points", x + "," + (y-r) + " " + (x+r) + "," + y + " " + x + "," + (y+r) + " " + (x-r) + "," + y);
        dia.setAttribute("fill", color); dia.setAttribute("opacity", "0.7");
        svg.appendChild(dia);
      });
    }

    // Past signal markers
    if (state.showMarkers && this.data.signal_markers) {
      this.data.signal_markers.forEach(m => {
        const idx = c.findIndex(k => k.t === m.t);
        if (idx < 0) return;
        const x = xScale(idx);
        const y = yScale(m.price);
        const isBuy = m.type === "buy";
        const color = isBuy ? "#3fb950" : "#f85149";
        const arrow = document.createElementNS(SVG_NS, "path");
        const dy = isBuy ? 14 : -14;
        arrow.setAttribute("d", "M" + x + "," + (y + dy) + " L" + (x - 5) + "," + (y + dy + 7) + " L" + (x + 5) + "," + (y + dy + 7) + " Z");
        arrow.setAttribute("fill", color); arrow.setAttribute("opacity", "0.85");
        svg.appendChild(arrow);
      });
    }

    // Trade levels
    if (state.showLevels && this.data.trade) {
      const t = this.data.trade;
      const drawLevel = (price, label, color, dash) => {
        if (price == null || isNaN(price)) return;
        const y = yScale(price);
        const ln = document.createElementNS(SVG_NS, "line");
        ln.setAttribute("x1", left); ln.setAttribute("x2", W - right);
        ln.setAttribute("y1", y); ln.setAttribute("y2", y);
        ln.setAttribute("stroke", color); ln.setAttribute("stroke-width", "1.4");
        if (dash) ln.setAttribute("stroke-dasharray", dash);
        svg.appendChild(ln);
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", W - right + 2);
        rect.setAttribute("y", y - 9);
        rect.setAttribute("width", 64); rect.setAttribute("height", 18);
        rect.setAttribute("rx", 3); rect.setAttribute("fill", color);
        svg.appendChild(rect);
        const tx = document.createElementNS(SVG_NS, "text");
        tx.setAttribute("x", W - right + 6); tx.setAttribute("y", y + 3);
        tx.setAttribute("fill", "#0d1117");
        tx.setAttribute("font-size", "10"); tx.setAttribute("font-weight", "700");
        tx.setAttribute("font-family", "JetBrains Mono, monospace");
        tx.textContent = label;
        svg.appendChild(tx);
      };
      drawLevel(t.stop_loss, "SL " + fmt.price(t.stop_loss, t.entry), "#f85149", "5 3");
      drawLevel(t.take_profit, "TP " + fmt.price(t.take_profit, t.entry), "#3fb950", "5 3");
      drawLevel(t.entry, "E " + fmt.price(t.entry, t.entry), "#00d4aa", "0");
    }

    // X-axis labels
    const labelEvery = Math.max(1, Math.ceil((W < 600 ? 90 : 110) / xStep));
    for (let i = 0; i < n; i += labelEvery) {
      const x = xScale(i);
      const tx = document.createElementNS(SVG_NS, "text");
      tx.setAttribute("x", x); tx.setAttribute("y", H - 10);
      tx.setAttribute("fill", "#768390");
      tx.setAttribute("font-size", xStep < 8 ? "9" : "10");
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-family", "JetBrains Mono, monospace");
      tx.textContent = fmt.time(c[i].t);
      svg.appendChild(tx);
    }

    host.appendChild(svg);

    // Hover overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;cursor:crosshair;";
    host.appendChild(overlay);
    overlay.addEventListener("mousemove", (e) => {
      const rect = host.getBoundingClientRect();
      const mx = e.clientX - rect.left - left;
      const idx = Math.max(0, Math.min(n - 1, Math.floor(mx / xStep)));
      const k = c[idx];
      const up = k.c >= k.o;
      this.tooltip.innerHTML = `
        <div class="tt-time">${fmt.time(k.t)}</div>
        <div class="tt-row"><span class="lbl">O</span><span class="val">${fmt.price(k.o, k.c)}</span></div>
        <div class="tt-row"><span class="lbl">H</span><span class="val">${fmt.price(k.h, k.c)}</span></div>
        <div class="tt-row"><span class="lbl">L</span><span class="val">${fmt.price(k.l, k.c)}</span></div>
        <div class="tt-row"><span class="lbl">C</span><span class="val ${up ? 'up' : 'down'}">${fmt.price(k.c, k.c)}</span></div>
        <div class="tt-row"><span class="lbl">V</span><span class="val">${(k.v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></div>`;
      this.tooltip.style.display = "block";
      const tx = Math.min(rect.width - 160, e.clientX - rect.left + 14);
      const ty = Math.min(rect.height - 130, e.clientY - rect.top + 14);
      this.tooltip.style.left = tx + "px";
      this.tooltip.style.top = ty + "px";
    });
    overlay.addEventListener("mouseleave", () => { this.tooltip.style.display = "none"; });
  }
}

function renderChart(chartData) {
  if (!state.chart) state.chart = new CandleChart($("chart-host"));
  if (chartData && chartData.candles) state.chart.render(chartData);
}

function syncTimeframeButtons() {
  document.querySelectorAll(".tf-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tf === state.currentInterval);
  });
}

document.querySelectorAll(".tf-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.isLoading) return;
    state.currentInterval = btn.dataset.tf;
    syncTimeframeButtons();
    if (state.currentSymbol) {
      const sym = state.universe.find(p => p.label === state.currentSymbol);
      if (sym) analyseSymbol(sym.symbol);
    }
  });
});

$("toggle-ema").addEventListener("change", e => { state.showEma = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-bb").addEventListener("change",  e => { state.showBb  = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-markers").addEventListener("change", e => { state.showMarkers = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-levels").addEventListener("change", e => { state.showLevels = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-fvg").addEventListener("change",  e => { state.showFvg  = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-bos").addEventListener("change",  e => { state.showBos  = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-ob").addEventListener("change",    e => { state.showOb   = e.target.checked; if (state.chart) state.chart._draw(); });
$("toggle-sweeps").addEventListener("change",e => { state.showSweeps = e.target.checked; if (state.chart) state.chart._draw(); });

$("pair-search").addEventListener("input", e => showSuggestions(e.target.value));
$("pair-search").addEventListener("focus", e => showSuggestions(e.target.value));
$("pair-search").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const q = e.target.value.trim();
    if (!q) { fetchSignal(true); return; }
    const match = state.universe.find(p =>
      p.label.toLowerCase() === q.toLowerCase() ||
      p.symbol.toLowerCase() === q.toLowerCase() ||
      p.symbol.toLowerCase().includes(q.toLowerCase()) ||
      p.label.toLowerCase().includes(q.toLowerCase()));
    if (match) analyseSymbol(match.symbol);
    $("pair-suggestions").classList.remove("show");
  }
  if (e.key === "Escape") $("pair-suggestions").classList.remove("show");
});
document.addEventListener("click", e => {
  if (!e.target.closest(".topbar-search")) {
    $("pair-suggestions").classList.remove("show");
  }
});

$("refresh-btn").addEventListener("click", () => {
  if (state.currentSymbol) {
    const sym = state.universe.find(p => p.label === state.currentSymbol);
    if (sym) analyseSymbol(sym.symbol);
    else fetchSignal(true);
  } else {
    fetchSignal(true);
  }
});

function scheduleAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = setInterval(() => {
    if (state.isLoading) return;
    if (state.currentSymbol) {
      const sym = state.universe.find(p => p.label === state.currentSymbol);
      if (sym) analyseSymbol(sym.symbol);
      else fetchSignal();
    } else {
      fetchSignal();
    }
  }, 60_000);
}

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (e.key.toLowerCase() === "r") $("refresh-btn").click();
});

setInterval(() => {
  if (!state.lastUpdate) return;
  const ago = Math.floor((Date.now() - state.lastUpdate) / 1000);
  const txt = ago < 60 ? ago + "s ago" : Math.floor(ago/60) + "m ago";
  setStatus("Live · " + txt, "live", $("status-lat").textContent.replace(/[^\\d]/g, ""));
}, 5000);

// --- AI Chatbot ---
$("chat-toggle").addEventListener("click", () => {
  state.chatOpen = !state.chatOpen;
  $("chat-body").hidden = !state.chatOpen;
  $("chat-toggle").textContent = state.chatOpen ? "✕ Close" : "💬 Open";
  if (state.chatOpen && state.chatHistory.length === 0) {
    appendChat("bot", "👋 Hi! I'm your chart analyst. Ask me about the current signal, indicators (RSI, MACD, EMA), or trading concepts (FVG, BOS, Order Blocks).");
  }
});

function appendChat(role, text) {
  const msg = document.createElement("div");
  msg.className = "chat-msg " + role;
  msg.innerHTML = mdLite(text);
  $("chat-messages").appendChild(msg);
  msg.scrollIntoView({ behavior: "smooth", block: "end" });
  state.chatHistory.push({ role, content: text });
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  appendChat("user", text);
  $("chat-input").value = "";
  appendChat("system", "thinking…");
  const placeholder = $("chat-messages").lastChild;
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: state.chatHistory.slice(-6),
        context: state._chatContext || {},
      }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    placeholder.remove();
    appendChat("bot", data.reply);
  } catch (e) {
    placeholder.remove();
    appendChat("bot", "⚠️ Chat error: " + e.message);
  }
}

$("chat-form").addEventListener("submit", e => { e.preventDefault(); sendChatMessage($("chat-input").value); });
document.querySelectorAll(".chat-quick-btn").forEach(btn => {
  btn.addEventListener("click", () => sendChatMessage(btn.dataset.q));
});

window.addEventListener("resize", () => { if (state.chart) state.chart._draw(); });

(async function init() {
  state.chart = new CandleChart($("chart-host"));
  await loadUniverse();
  fetchSignal();
})();
