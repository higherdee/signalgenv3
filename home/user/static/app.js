// =====================================================================
//  SignalGen — frontend v3.1 (FIXED x-axis labels)
//  • Always-visible chart with skeleton loader (fixes 0x0 render bug)
//  • Mature interaction model — no neon, no AI-startup vibes
//  • Truly responsive: desktop / tablet / phone
// =====================================================================
const BUILD_TAG = "v3.1-2026-06-21";

const $ = (id) => document.getElementById(id);
const fmt = {
  price(p, ref) {
    if (p == null || isNaN(p)) return "—";
    const n = Number(p), r = ref != null ? Math.abs(ref) : n;
    if (r >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (r >= 10)   return n.toFixed(4);
    if (r >= 1)    return n.toFixed(4);
    if (r >= 0.01) return n.toFixed(6);
    return n.toFixed(8);
  },
  pct(p) {
    if (p == null || isNaN(p)) return "—";
    return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  },
  signed(p, d = 3) {
    if (p == null || isNaN(p)) return "—";
    return (p >= 0 ? "+" : "") + p.toFixed(d);
  },
  time(t) {
    const d = new Date(t);
    return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  },
};
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, m => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[m])));

// ----- State ---------------------------------------------------------------
const state = {
  universe: [],
  lastUpdate: 0,
  currentSymbol: null,
  currentInterval: "1H",
  isLoading: false,
  chart: null, // CandleChart instance
  searchAbort: null,
  showEma: true,
  showBb: true,
  showMarkers: true,
  showLevels: true,
};

// ----- Status pill ---------------------------------------------------------
function setStatus(text, kind, latency) {
  $("status-text").textContent = text;
  $("status-lat").textContent = latency ? ` ${latency}ms` : "";
  $("status-dot").className = "status-dot" + (kind ? " " + kind : "");
}

// ----- Universe + autocomplete --------------------------------------------
async function loadUniverse() {
  try {
    const r = await fetch("/api/universe");
    const d = await r.json();
    state.universe = d.pairs || [];
  } catch (e) {
    console.error("universe load failed", e);
  }
}

function showSuggestions(q) {
  const box = $("pair-suggestions");
  q = (q || "").trim().toLowerCase();
  if (!q) { box.classList.remove("show"); return; }
  const matches = state.universe.filter(p =>
    p.label.toLowerCase().includes(q) ||
    p.symbol.toLowerCase().includes(q) ||
    p.asset_class.toLowerCase().includes(q)
  ).slice(0, 12);

  if (!matches.length) {
    box.innerHTML = '<div class="suggestion muted"><span class="s-label">No matches</span></div>';
  } else {
    // Group by asset class
    const groups = {};
    matches.forEach(m => {
      (groups[m.asset_class] = groups[m.asset_class] || []).push(m);
    });
    let html = "";
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="suggestion group-header">${esc(cat)}</div>`;
      for (const p of items) {
        html += `<div class="suggestion" data-sym="${esc(p.symbol)}">
          <span class="s-label">${esc(p.label)}</span>
          <span class="s-meta">${esc(p.source.split(" ")[0])}</span>
          <span class="s-cat">${esc(p.asset_class)}</span>
        </div>`;
      }
    }
    box.innerHTML = html;
    box.querySelectorAll(".suggestion[data-sym]").forEach(el => {
      el.addEventListener("click", () => {
        const sym = el.dataset.sym;
        const label = el.querySelector(".s-label").textContent;
        $("pair-search").value = label;
        box.classList.remove("show");
        analyseSymbol(sym);
      });
    });
  }
  box.classList.add("show");
}

// ----- Best-pair signal ----------------------------------------------------
async function fetchSignal(force = false) {
  if (state.isLoading) return;
  state.isLoading = true;
  $("refresh-btn").disabled = true;
  setStatus("Loading…", "");
  try {
    const url = "/api/signal" + (force ? "?force=1" : "");
    const t0 = performance.now();
    const r = await fetch(url);
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
  } catch (e) {
    console.error(e);
    setStatus("Error: " + e.message, "err");
  } finally {
    state.isLoading = false;
    $("refresh-btn").disabled = false;
  }
}

// ----- Any-pair on demand --------------------------------------------------
async function analyseSymbol(symbol) {
  if (state.isLoading) return;
  state.isLoading = true;
  $("refresh-btn").disabled = true;
  setStatus(`Loading ${symbol}…`, "");
  try {
    const url = `/api/analyse/${encodeURIComponent(symbol)}?interval=${state.currentInterval}`;
    const t0 = performance.now();
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`HTTP ${r.status} — ${txt.slice(0, 120)}`);
    }
    const data = await r.json();
    state.currentSymbol = data.signal.pair;
    renderSignal(data, /*specificPair*/ true);
    renderChart(data.chart);
    setStatus("Live", "live", Math.round(performance.now() - t0));
    state.lastUpdate = Date.now();
  } catch (e) {
    console.error(e);
    setStatus("Error: " + e.message, "err");
    alert("Failed: " + e.message);
  } finally {
    state.isLoading = false;
    $("refresh-btn").disabled = false;
  }
}

// ----- Render signal card --------------------------------------------------
function renderSignal(data, isSpecific = false) {
  const sig = data.signal;
  $("s-pair").textContent = sig.pair;
  $("s-class").textContent = sig.asset_class;
  $("s-mtf").textContent = `MTF ${sig.multi_tf_agreement}/2`;
  $("s-pattern").textContent =
    (sig.pattern_flags && sig.pattern_flags.length)
      ? sig.pattern_flags[0]
      : "—";

  const dir = sig.direction || "NEUTRAL";
  const badge = $("direction-badge");
  badge.textContent = dir;
  badge.className = "badge " + dir.toLowerCase();

  $("s-conf").textContent = (sig.confidence * 100).toFixed(1) + "%";
  $("s-conf-bar").style.width = (sig.confidence * 100).toFixed(0) + "%";

  $("s-entry").textContent = fmt.price(sig.entry, sig.last_price);
  $("s-tp").textContent    = fmt.price(sig.take_profit, sig.last_price);
  $("s-sl").textContent    = fmt.price(sig.stop_loss, sig.last_price);
  $("s-rr").textContent    = "1:" + sig.risk_reward.toFixed(1);

  $("s-last").textContent = fmt.price(sig.last_price);
  const ch = sig.change_24h_pct;
  const chEl = $("s-24h");
  chEl.textContent = fmt.pct(ch);
  chEl.style.color = ch >= 0 ? "var(--bull)" : "var(--bear)";

  // rationale
  const ul = $("s-rationale");
  ul.innerHTML = "";
  sig.rationale.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  });

  // indicators
  renderIndicators(sig.indicators);

  // news
  const news = $("s-news");
  news.innerHTML = "";
  $("news-count").textContent = `(${sig.news_headlines.length})`;
  if (!sig.news_headlines.length) {
    news.innerHTML = '<li class="nl-empty">No directly matched headlines — using global sentiment.</li>';
  } else {
    sig.news_headlines.forEach(h => {
      const li = document.createElement("li");
      const cls = h.sentiment > 0.1 ? "pos" : (h.sentiment < -0.1 ? "neg" : "");
      li.innerHTML = `
        <span class="nl-src">${esc(h.source)}</span>
        <span class="nl-title">${esc(h.title)}</span>
        <span class="nl-sent ${cls}">${fmt.signed(h.sentiment, 2)}</span>`;
      news.appendChild(li);
    });
  }

  // chart meta
  $("chart-symbol").textContent = sig.pair;
  $("chart-meta").textContent = `${state.currentInterval} · ${sig.asset_class}`;
  $("foot-source").textContent = sig.market_source;
  $("foot-gen").textContent = sig.generated_at;
  $("foot-lat").textContent = data.latency_ms ? data.latency_ms + " ms" : "—";
}

function renderIndicators(ind) {
  const cells = [
    { l: "RSI",      v: ind.rsi,        f: v => v.toFixed(1),
      c: v => v >= 55 && v <= 70 ? "bull" : v > 70 ? "bear" : v < 30 ? "bull" : "" },
    { l: "MACD-H",   v: ind.macd_hist,  f: v => v.toFixed(5),
      c: v => v > 0 ? "bull" : "bear" },
    { l: "EMA 20",   v: ind.ema20,      f: v => fmt.price(v) },
    { l: "EMA 50",   v: ind.ema50,      f: v => fmt.price(v) },
    { l: "EMA 200",  v: ind.ema200,     f: v => fmt.price(v) },
    { l: "ATR%",     v: ind.atr_pct,    f: v => v.toFixed(2) + "%",
      c: v => v >= 0.4 && v <= 3 ? "bull" : "warn" },
    { l: "Stoch K",  v: ind.stoch_k,    f: v => v.toFixed(0),
      c: v => v > 80 ? "bear" : v < 20 ? "bull" : "" },
    { l: "ADX",      v: ind.adx,        f: v => v.toFixed(1),
      c: v => v >= 25 ? "bull" : "" },
    { l: "BB-H",     v: ind.bb_high,    f: v => fmt.price(v) },
    { l: "BB-L",     v: ind.bb_low,     f: v => fmt.price(v) },
    { l: "VWAP",     v: ind.vwap,       f: v => fmt.price(v) },
    { l: "1h ret",   v: ind.ret_1h,     f: v => fmt.pct(v),
      c: v => v >= 0 ? "bull" : "bear" },
    { l: "4h ret",   v: ind.ret_4h,     f: v => fmt.pct(v),
      c: v => v >= 0 ? "bull" : "bear" },
    { l: "24h ret",  v: ind.ret_24h,    f: v => fmt.pct(v),
      c: v => v >= 0 ? "bull" : "bear" },
  ];
  const grid = $("ind-grid");
  grid.innerHTML = "";
  cells.forEach(c => {
    if (c.v == null || isNaN(c.v)) return;
    const div = document.createElement("div");
    div.className = "ind-cell";
    const cls = c.c ? c.c(c.v) : "";
    div.innerHTML = `<span class="lbl">${c.l}</span><span class="val ${cls}">${c.f(c.v)}</span>`;
    grid.appendChild(div);
  });
}

function renderRanking(rows) {
  const body = $("rank-body");
  body.innerHTML = "";
  if (!rows || !rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="table-empty">No data.</td></tr>';
    return;
  }
  $("rank-meta").textContent = `${rows.length} pairs · click any row to analyse`;
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (r.label === state.currentSymbol) tr.classList.add("active");
    const trendCls = r.trend === "UP" ? "trend-up" : r.trend === "DOWN" ? "trend-down" : "trend-side";
    const ch = r.change_24h_pct;
    const chCol = ch >= 0 ? "color:var(--bull)" : "color:var(--bear)";
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${esc(r.label)}</strong></td>
      <td><span class="chip">${esc(r.asset_class)}</span></td>
      <td class="num">${fmt.price(r.last_price)}</td>
      <td class="num" style="${chCol}">${fmt.pct(ch)}</td>
      <td><span class="${trendCls}">${esc(r.trend)}</span></td>
      <td class="num"><strong>${r.composite.toFixed(1)}</strong></td>
      <td class="num">${r.bull_votes}/${r.bear_votes}</td>
      <td class="num" style="color:${r.sentiment >= 0 ? 'var(--bull)' : 'var(--bear)'}">${fmt.signed(r.sentiment, 2)}</td>`;
    tr.addEventListener("click", () => {
      $("pair-search").value = r.label;
      analyseSymbol(r.symbol);
    });
    body.appendChild(tr);
  });
}

// ----- Candlestick chart ---------------------------------------------------
class CandleChart {
  constructor(host) {
    this.host = host;
    this.tooltip = $("chart-tooltip");
    this.data = null;
    this.padding = { top: 16, right: 70, bottom: 28, left: 8 };
    this._ro = null;
    this._setupResizeObserver();
  }
  _setupResizeObserver() {
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => { if (this.data) this._draw(); });
      this._ro.observe(this.host);
    }
  }
  render(data) {
    this.data = data;
    this._draw();
  }
  _draw() {
    const host = this.host;
    // Remove skeleton + any prior SVG
    host.querySelectorAll(".skeleton-chart, svg").forEach(el => el.remove());
    if (!this.data || !this.data.candles || !this.data.candles.length) {
      const sk = document.createElement("div");
      sk.className = "skeleton-chart";
      sk.innerHTML = `<div class="sk-line"></div><div class="sk-line"></div>
        <div class="sk-line"></div><div class="sk-line"></div>
        <div class="sk-line"></div><div class="sk-line"></div>`;
      host.appendChild(sk);
      return;
    }
    const W = host.clientWidth || 800;
    const H = host.clientHeight || 460;
    const { top, right, bottom, left } = this.padding;
    const innerW = W - left - right;
    const innerH = H - top - bottom;
    const c = this.data.candles;
    const n = c.length;
    if (innerW <= 0 || innerH <= 0) return; // container not ready yet — ResizeObserver will retry

    // price range
    let minP = Math.min(...c.map(k => k.l));
    let maxP = Math.max(...c.map(k => k.h));
    if (state.showBb && this.data.bb_high && this.data.bb_low) {
      this.data.bb_high.forEach(v => { if (v != null) maxP = Math.max(maxP, v); });
      this.data.bb_low.forEach(v  => { if (v != null) minP = Math.min(minP, v); });
    }
    const pad = (maxP - minP) * 0.05 || maxP * 0.001;
    const yMin = minP - pad;
    const yMax = maxP + pad;

    const xStep = innerW / n;
    const candleW = Math.max(2, Math.min(14, xStep * 0.7));
    const yScale = (p) => top + innerH - ((p - yMin) / (yMax - yMin)) * innerH;
    const xScale = (i) => left + i * xStep + xStep / 2;

    const SVG_NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    // ---- gridlines + y-axis labels
    const gridY = 5;
    for (let i = 0; i <= gridY; i++) {
      const y = top + (innerH * i / gridY);
      const p = yMax - (yMax - yMin) * (i / gridY);
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

    // ---- Bollinger Bands
    if (state.showBb && this.data.bb_high && this.data.bb_low) {
      let hiPts = "", loPts = "";
      for (let i = 0; i < n; i++) {
        const vh = this.data.bb_high[i], vl = this.data.bb_low[i];
        if (vh != null && vl != null) {
          hiPts += `${xScale(i)},${yScale(vh)} `;
          loPts += `${xScale(i)},${yScale(vl)} `;
        }
      }
      [["upper", hiPts, "#58a6ff", "stroke-dasharray='2 3' opacity='0.4'"],
       ["lower", loPts, "#58a6ff", "stroke-dasharray='2 3' opacity='0.4'"]].forEach(([_, pts, color, attr]) => {
        const pl = document.createElementNS(SVG_NS, "polyline");
        pl.setAttribute("points", pts);
        pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", color); pl.setAttribute("stroke-width", "1");
        Object.entries({
          "stroke-dasharray": "2 3", "opacity": "0.4"
        }).forEach(([k, v]) => pl.setAttribute(k, v));
        svg.appendChild(pl);
      });
    }

    // ---- EMAs
    if (state.showEma) {
      const drawLine = (arr, color) => {
        if (!arr || !arr.length) return;
        let pts = "";
        for (let i = 0; i < n; i++) {
          const v = arr[i];
          if (v != null) pts += `${xScale(i)},${yScale(v)} `;
        }
        const pl = document.createElementNS(SVG_NS, "polyline");
        pl.setAttribute("points", pts);
        pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", color); pl.setAttribute("stroke-width", "1.5");
        pl.setAttribute("opacity", "0.85");
        svg.appendChild(pl);
      };
      drawLine(this.data.ema20, "#3fb950");
      drawLine(this.data.ema50, "#d29922");
      drawLine(this.data.ema200, "#58a6ff");
    }

    // ---- Candles
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
      body.setAttribute("fill", color);
      body.setAttribute("stroke", color);
      body.setAttribute("stroke-width", "0.8");
      svg.appendChild(body);
    });

    // ---- Past signal markers
    if (state.showMarkers && this.data.signal_markers) {
      this.data.signal_markers.forEach(m => {
        const idx = c.findIndex(k => k.t === m.t);
        if (idx < 0) return;
        const x = xScale(idx);
        const y = yScale(m.price);
        const isBuy = m.type === "buy";
        const color = isBuy ? "#3fb950" : "#f85149";
        const dy = isBuy ? 14 : -14;
        const arrow = document.createElementNS(SVG_NS, "path");
        const tip = `${x},${y + dy}`;
        const left = `${x - 5},${y + dy + (isBuy ? 7 : -7)}`;
        const right = `${x + 5},${y + dy + (isBuy ? 7 : -7)}`;
        arrow.setAttribute("d", `M${tip} L${left} L${right} Z`);
        arrow.setAttribute("fill", color);
        arrow.setAttribute("stroke", "#0d1117");
        arrow.setAttribute("stroke-width", "0.5");
        arrow.setAttribute("opacity", "0.85");
        svg.appendChild(arrow);
      });
    }

    // ---- Trade levels (Entry / TP / SL)
    if (state.showLevels && this.data.trade) {
      const t = this.data.trade;
      const drawLevel = (price, label, color, dash) => {
        if (price == null || isNaN(price)) return;
        const y = yScale(price);
        const ln = document.createElementNS(SVG_NS, "line");
        ln.setAttribute("x1", left); ln.setAttribute("x2", W - right);
        ln.setAttribute("y1", y); ln.setAttribute("y2", y);
        ln.setAttribute("stroke", color); ln.setAttribute("stroke-width", "1.2");
        if (dash) ln.setAttribute("stroke-dasharray", dash);
        svg.appendChild(ln);
        // Tag
        const tagW = Math.min(64, right - 6);
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", W - right + 2);
        rect.setAttribute("y", y - 8);
        rect.setAttribute("width", tagW);
        rect.setAttribute("height", 16);
        rect.setAttribute("rx", 3);
        rect.setAttribute("fill", color);
        svg.appendChild(rect);
        const tx = document.createElementNS(SVG_NS, "text");
        tx.setAttribute("x", W - right + 6);
        tx.setAttribute("y", y + 3);
        tx.setAttribute("fill", "#0d1117");
        tx.setAttribute("font-size", "10");
        tx.setAttribute("font-weight", "700");
        tx.setAttribute("font-family", "JetBrains Mono, monospace");
        tx.textContent = label;
        svg.appendChild(tx);
      };
      drawLevel(t.stop_loss, "SL " + fmt.price(t.stop_loss, t.entry), "#f85149", "5 3");
      drawLevel(t.take_profit, "TP " + fmt.price(t.take_profit, t.entry), "#3fb950", "5 3");
      drawLevel(t.entry, "E " + fmt.price(t.entry, t.entry), "#58a6ff", "0");
    }

    // ---- x-axis labels (adaptive density — fewer on narrow screens)
    const targetLabelCount = W < 500 ? 4 : W < 900 ? 6 : 8;
    const labelEvery = Math.max(1, Math.floor(n / targetLabelCount));
    const compactFmt = (d) => {
      const m = String(d.getMonth() + 1);
      const day = String(d.getDate());
      const hr = String(d.getHours()).padStart(2, "0");
      const mn = String(d.getMinutes()).padStart(2, "0");
      return `${m}/${day} ${hr}:${mn}`;
    };
    const fullFmt = (d) => {
      const month = d.toLocaleString("en-US", { month: "short" });
      const day = String(d.getDate());
      const hr = String(d.getHours()).padStart(2, "0");
      const mn = String(d.getMinutes()).padStart(2, "0");
      return `${month} ${day} ${hr}:${mn}`;
    };
    for (let i = 0; i < n; i += labelEvery) {
      const x = xScale(i);
      const tx = document.createElementNS(SVG_NS, "text");
      tx.setAttribute("x", x); tx.setAttribute("y", H - 10);
      tx.setAttribute("fill", "#768390");
      tx.setAttribute("font-size", xStep < 8 ? "9" : "10");
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-family", "JetBrains Mono, monospace");
      const d = new Date(c[i].t);
      tx.textContent = W < 600 ? compactFmt(d) : fullFmt(d);
      svg.appendChild(tx);
    }

    host.appendChild(svg);

    // ---- Hover overlay for tooltip
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

function renderChart(data) {
  if (!state.chart) state.chart = new CandleChart($("chart-host"));
  if (data && data.candles) state.chart.render(data);
}

// ----- Timeframe buttons ---------------------------------------------------
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

// ----- Chart toggles -------------------------------------------------------
$("toggle-ema").addEventListener("change", () => { state.showEma = $("toggle-ema").checked; if (state.chart) state.chart._draw(); });
$("toggle-bb").addEventListener("change", () => { state.showBb = $("toggle-bb").checked; if (state.chart) state.chart._draw(); });
$("toggle-markers").addEventListener("change", () => { state.showMarkers = $("toggle-markers").checked; if (state.chart) state.chart._draw(); });
$("toggle-levels").addEventListener("change", () => { state.showLevels = $("toggle-levels").checked; if (state.chart) state.chart._draw(); });

// ----- Mobile floating control bar (shows on phones when topbar controls hidden) ----
(function injectMobileBar() {
  if (document.getElementById("mobile-bar")) return;
  const bar = document.createElement("div");
  bar.id = "mobile-bar";
  bar.className = "mobile-bar";
  bar.innerHTML = `
    <div class="tf-group">
      <button class="tf-btn" data-tf="15m">15m</button>
      <button class="tf-btn active" data-tf="1H">1H</button>
      <button class="tf-btn" data-tf="4H">4H</button>
      <button class="tf-btn" data-tf="1D">1D</button>
    </div>
    <button id="mobile-refresh" class="btn btn-ghost">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Refresh
    </button>
  `;
  document.body.appendChild(bar);
  bar.querySelectorAll(".tf-btn").forEach(b => {
    b.addEventListener("click", () => {
      state.currentInterval = b.dataset.tf;
      syncTimeframeButtons();
      if (state.currentSymbol) {
        const sym = state.universe.find(p => p.label === state.currentSymbol);
        if (sym) analyseSymbol(sym.symbol);
      }
    });
  });
  bar.querySelector("#mobile-refresh").addEventListener("click", () => fetchSignal(true));
})();

// ----- Search input --------------------------------------------------------
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
      p.label.toLowerCase().includes(q.toLowerCase())
    );
    if (match) analyseSymbol(match.symbol);
    else alert("Pair not found. Try: BTC/USDT, ETH/USDT, EUR/USD, Gold…");
    $("pair-suggestions").classList.remove("show");
  }
  if (e.key === "Escape") $("pair-suggestions").classList.remove("show");
});
document.addEventListener("click", e => {
  if (!e.target.closest(".topbar-search")) {
    $("pair-suggestions").classList.remove("show");
  }
});

// ----- Refresh button ------------------------------------------------------
$("refresh-btn").addEventListener("click", () => fetchSignal(true));

// ----- Keyboard shortcut ---------------------------------------------------
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (e.key.toLowerCase() === "r") fetchSignal(true);
});

// ----- Live "last update" label --------------------------------------------
setInterval(() => {
  if (!state.lastUpdate) return;
  const ago = Math.floor((Date.now() - state.lastUpdate) / 1000);
  const txt = ago < 60 ? `${ago}s ago` : `${Math.floor(ago/60)}m ago`;
  setStatus(`Live · ${txt}`, "live",
    $("status-lat").textContent.replace(/[^\d]/g, ""));
}, 5000);

// ----- Auto-refresh every 60s ----------------------------------------------
setInterval(() => { if (!state.isLoading) fetchSignal(); }, 60_000);

// ----- Boot ---------------------------------------------------------------
(async function init() {
  state.chart = new CandleChart($("chart-host"));
  await loadUniverse();
  fetchSignal();
  console.log("SignalGen build:", BUILD_TAG);
})();
