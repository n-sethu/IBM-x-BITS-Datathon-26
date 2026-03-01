/**
 * MarketSignals Dashboard — dashboard.js
 * Handles: timeframe selection, series toggles, overlay chart, mid-month
 * analysis, mispricing score chart, individual mini-charts, stats cards.
 */

// ── Configuration ────────────────────────────────────────────────────────────

const SERIES_COLORS = {
  GDPC1:    "#4F8EF7",
  UNRATE:   "#F76F4F",
  CPIAUCSL: "#4FBF67",
  FEDFUNDS: "#BF4FBF",
  USREC:    "#F7C24F",
  T10Y2Y:   "#4FBFBF",
  DEXUSEU:  "#F74F9E",
};

const PLOTLY_DARK = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#e6edf3", family: "Segoe UI, system-ui, sans-serif", size: 12 },
  xaxis: {
    gridcolor: "#21262d",
    linecolor: "#30363d",
    tickcolor: "#8b949e",
    zerolinecolor: "#30363d",
  },
  yaxis: {
    gridcolor: "#21262d",
    linecolor: "#30363d",
    tickcolor: "#8b949e",
    zerolinecolor: "#30363d",
  },
  legend: {
    bgcolor: "#21262d",
    bordercolor: "#30363d",
    borderwidth: 1,
    font: { size: 11 },
  },
  margin: { t: 30, r: 20, b: 50, l: 60 },
  hovermode: "x unified",
};

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  start: offsetDate(-5 * 365),
  end:   today(),
  activeSeries: ["UNRATE", "CPIAUCSL", "FEDFUNDS"],
  seriesMeta: {},
  cache: {},           // key: `${seriesId}_${start}_${end}`
};

// ── Utility ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtNum(val, units) {
  if (val == null || isNaN(val)) return "N/A";
  if (units === "%" || units === "0/1") return val.toFixed(2) + (units === "%" ? "%" : "");
  if (units === "Billions $") return "$" + (val / 1000).toFixed(2) + "T";
  return val.toFixed(2);
}

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    state.seriesMeta = await fetchJSON("/api/series_list");
  } catch (e) {
    console.error("Could not load series list", e);
    return;
  }

  buildSeriesTogles();
  buildSeriesSelects();
  setupTimeframeButtons();
  setupCustomRange();
  setupTabs();

  // Set initial date inputs
  document.getElementById("date-start").value = state.start;
  document.getElementById("date-end").value   = state.end;
  document.getElementById("last-updated").textContent = "Updated: " + new Date().toLocaleString();

  await refreshAll();
}

// ── Build UI Elements ─────────────────────────────────────────────────────────

function buildSeriesTogles() {
  const container = document.getElementById("series-toggles");
  container.innerHTML = "";
  Object.entries(state.seriesMeta).forEach(([id, meta]) => {
    const btn = document.createElement("div");
    btn.className = "series-toggle" + (state.activeSeries.includes(id) ? " on" : "");
    btn.dataset.id = id;
    btn.style.borderColor = state.activeSeries.includes(id) ? meta.color : "transparent";
    if (state.activeSeries.includes(id)) btn.style.backgroundColor = meta.color + "22";
    btn.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
    btn.addEventListener("click", () => toggleSeries(id, btn, meta.color));
    container.appendChild(btn);
  });
}

function toggleSeries(id, btn, color) {
  const idx = state.activeSeries.indexOf(id);
  if (idx === -1) {
    state.activeSeries.push(id);
    btn.classList.add("on");
    btn.style.borderColor = color;
    btn.style.backgroundColor = color + "22";
  } else {
    state.activeSeries.splice(idx, 1);
    btn.classList.remove("on");
    btn.style.borderColor = "transparent";
    btn.style.backgroundColor = "";
  }
  renderOverlayChart();
  renderStatsCards();
  renderIndividualCharts();
}

function buildSeriesSelects() {
  ["mm-series-select", "score-series-select"].forEach(selectId => {
    const sel = document.getElementById(selectId);
    sel.innerHTML = "";
    Object.entries(state.seriesMeta).forEach(([id, meta]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = meta.label;
      if (id === "CPIAUCSL") opt.selected = true;
      sel.appendChild(opt);
    });
  });

  document.getElementById("mm-series-select").addEventListener("change", renderMidMonthChart);
  document.getElementById("score-series-select").addEventListener("change", renderScoreChart);
}

// ── Timeframe ─────────────────────────────────────────────────────────────────

function setupTimeframeButtons() {
  document.querySelectorAll(".btn-tf").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-tf").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const years = btn.dataset.years;
      if (years === "all") {
        state.start = "1950-01-01";
      } else {
        state.start = offsetDate(-parseInt(years) * 365);
      }
      state.end = today();
      document.getElementById("date-start").value = state.start;
      document.getElementById("date-end").value   = state.end;
      invalidateCache();
      refreshAll();
    });
  });
}

function setupCustomRange() {
  document.getElementById("apply-range").addEventListener("click", () => {
    const s = document.getElementById("date-start").value;
    const e = document.getElementById("date-end").value;
    if (s && e && s <= e) {
      state.start = s;
      state.end   = e;
      document.querySelectorAll(".btn-tf").forEach(b => b.classList.remove("active"));
      invalidateCache();
      refreshAll();
    }
  });
}

function invalidateCache() {
  state.cache = {};
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

      // Lazy-render on first activation
      if (tab.dataset.tab === "mispricing") renderMidMonthChart();
      if (tab.dataset.tab === "score")      renderScoreChart();
    });
  });
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchSeries(id, start, end) {
  const key = `${id}_${start}_${end}`;
  if (state.cache[key]) return state.cache[key];
  const data = await fetchJSON(`/api/series/${id}?start=${start}&end=${end}`);
  state.cache[key] = data;
  if (data.demo) document.getElementById("demo-banner").style.display = "block";
  return data;
}

async function fetchMidMonth(id, start, end) {
  const key = `mm_${id}_${start}_${end}`;
  if (state.cache[key]) return state.cache[key];
  const data = await fetchJSON(`/api/mid_month_snapshot?series_id=${id}&start=${start}&end=${end}`);
  state.cache[key] = data;
  return data;
}

async function fetchMispricing(id, start, end) {
  const key = `mp_${id}_${start}_${end}`;
  if (state.cache[key]) return state.cache[key];
  const data = await fetchJSON(`/api/mispricing?series_id=${id}&start=${start}&end=${end}`);
  state.cache[key] = data;
  return data;
}

// ── Refresh All ───────────────────────────────────────────────────────────────

async function refreshAll() {
  await Promise.all([
    renderOverlayChart(),
    renderStatsCards(),
    renderIndividualCharts(),
  ]);
  // Tab-specific charts are rendered on tab switch, but refresh active one
  const activeTab = document.querySelector(".tab.active");
  if (activeTab?.dataset.tab === "mispricing") renderMidMonthChart();
  if (activeTab?.dataset.tab === "score")      renderScoreChart();
}

// ── Overlay Chart ─────────────────────────────────────────────────────────────

async function renderOverlayChart() {
  const el = document.getElementById("overlay-chart");
  if (state.activeSeries.length === 0) {
    el.innerHTML = `<div class="loading">Select at least one series above.</div>`;
    return;
  }

  el.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;

  try {
    const datasets = await Promise.all(
      state.activeSeries.map(id => fetchSeries(id, state.start, state.end))
    );

    const traces = datasets.map(d => ({
      x: d.dates,
      y: d.values,
      name: d.meta.label + (d.demo ? " ★" : ""),
      type: "scatter",
      mode: "lines",
      line: { color: d.meta.color, width: 2 },
      hovertemplate: `%{y:.3f} ${d.meta.units}<extra>${d.meta.label}</extra>`,
    }));

    const layout = {
      ...PLOTLY_DARK,
      showlegend: true,
      yaxis: {
        ...PLOTLY_DARK.yaxis,
        title: state.activeSeries.length === 1
          ? state.seriesMeta[state.activeSeries[0]]?.units
          : "Value (multiple scales)",
      },
    };

    // If multiple series have very different scales, add secondary axis for GDP
    if (state.activeSeries.includes("GDPC1") && state.activeSeries.length > 1) {
      const gdpTrace = traces.find((_, i) => state.activeSeries[i] === "GDPC1");
      if (gdpTrace) {
        gdpTrace.yaxis = "y2";
        layout.yaxis2 = {
          ...PLOTLY_DARK.yaxis,
          title: "GDP (Billions $)",
          overlaying: "y",
          side: "right",
          showgrid: false,
        };
      }
    }

    Plotly.newPlot(el, traces, layout, { responsive: true, displayModeBar: true, modeBarButtonsToRemove: ["toImage"] });
  } catch (e) {
    el.innerHTML = `<div class="error-msg">⚠ ${e.message}</div>`;
  }
}

// ── Stats Cards ───────────────────────────────────────────────────────────────

async function renderStatsCards() {
  const container = document.getElementById("stats-row");
  if (state.activeSeries.length === 0) { container.innerHTML = ""; return; }

  const datasets = await Promise.all(
    state.activeSeries.map(id =>
      fetchSeries(id, state.start, state.end).catch(() => null)
    )
  );

  container.innerHTML = "";
  state.activeSeries.forEach((id, i) => {
    const d = datasets[i];
    if (!d || !d.values.length) return;
    const meta   = d.meta;
    const latest = d.values[d.values.length - 1];
    const prev   = d.values.length > 1 ? d.values[d.values.length - 2] : null;
    const chg    = prev != null ? latest - prev : null;
    const chgPct = prev != null && prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null;

    const card = document.createElement("div");
    card.className = "stat-card";

    let changeHTML = "";
    if (chg != null) {
      const dir = chg > 0 ? "up" : chg < 0 ? "down" : "flat";
      const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "—";
      changeHTML = `<span class="stat-change ${dir}">${arrow} ${Math.abs(chg).toFixed(3)} (${chgPct != null ? chgPct.toFixed(1) + "%" : ""})</span>`;
    }

    const latestDate = d.dates[d.dates.length - 1];

    card.innerHTML = `
      <span class="stat-label">
        <span class="stat-dot" style="background:${meta.color}"></span>${meta.label}
      </span>
      <span class="stat-value">${fmtNum(latest, meta.units)}</span>
      ${changeHTML}
      <span class="hint">${latestDate}</span>
    `;
    container.appendChild(card);
  });
}

// ── Individual Mini Charts ────────────────────────────────────────────────────

async function renderIndividualCharts() {
  const grid = document.getElementById("individual-grid");
  grid.innerHTML = "";

  const ids = state.activeSeries;
  if (!ids.length) return;

  const datasets = await Promise.all(
    ids.map(id => fetchSeries(id, state.start, state.end).catch(() => null))
  );

  ids.forEach((id, i) => {
    const d = datasets[i];
    if (!d) return;

    const card = document.createElement("div");
    card.className = "mini-chart-card";
    card.innerHTML = `<h4 style="color:${d.meta.color}">${d.meta.label} <small style="color:#8b949e;font-weight:400">(${d.meta.units})</small></h4><div class="mini-chart" id="mini-${id}"></div>`;
    grid.appendChild(card);

    const trace = {
      x: d.dates,
      y: d.values,
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      fillcolor: d.meta.color + "1a",
      line: { color: d.meta.color, width: 1.5 },
      hovertemplate: `%{y:.3f} ${d.meta.units}<extra></extra>`,
    };
    const layout = {
      ...PLOTLY_DARK,
      margin: { t: 10, r: 12, b: 40, l: 50 },
      showlegend: false,
      yaxis: { ...PLOTLY_DARK.yaxis, title: "" },
    };
    Plotly.newPlot(`mini-${id}`, [trace], layout, { responsive: true, displayModeBar: false });
  });
}

// ── Mid-Month vs End-of-Month Chart ──────────────────────────────────────────

async function renderMidMonthChart() {
  const el  = document.getElementById("mm-chart");
  const id  = document.getElementById("mm-series-select").value;
  const meta = state.seriesMeta[id] || {};

  el.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;

  try {
    const d = await fetchMidMonth(id, state.start, state.end);

    const traces = [
      {
        x: d.mid_month.dates,
        y: d.mid_month.values,
        name: "Mid-Month Snapshot",
        type: "scatter",
        mode: "lines+markers",
        marker: { size: 5, color: "#4F8EF7" },
        line: { color: "#4F8EF7", width: 2, dash: "dot" },
        hovertemplate: `Mid: %{y:.3f}<extra></extra>`,
      },
      {
        x: d.end_of_month.dates,
        y: d.end_of_month.values,
        name: "End-of-Month Actual",
        type: "scatter",
        mode: "lines+markers",
        marker: { size: 5, color: "#4FBF67" },
        line: { color: "#4FBF67", width: 2 },
        hovertemplate: `EOM: %{y:.3f}<extra></extra>`,
      },
    ];

    const layout = {
      ...PLOTLY_DARK,
      showlegend: true,
      yaxis: { ...PLOTLY_DARK.yaxis, title: meta.units || "" },
      title: { text: `${meta.label || id} — Mid-Month vs End-of-Month`, font: { size: 13 } },
    };

    Plotly.newPlot(el, traces, layout, { responsive: true });
  } catch (e) {
    el.innerHTML = `<div class="error-msg">⚠ ${e.message}</div>`;
  }
}

// ── Mispricing Score Chart ────────────────────────────────────────────────────

async function renderScoreChart() {
  const el   = document.getElementById("score-chart");
  const id   = document.getElementById("score-series-select").value;
  const meta = state.seriesMeta[id] || {};

  el.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;

  try {
    const d = await fetchMispricing(id, state.start, state.end);

    if (!d.scores || !d.scores.length) {
      el.innerHTML = `<div class="loading">Not enough data for mispricing analysis.</div>`;
      return;
    }

    // Colour bars: green = EOM > mid (positive surprise), red = negative
    const barColors = d.scores.map(s => s > 0 ? "#4FBF67" : s < 0 ? "#F85149" : "#8b949e");

    const avgScore = (d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(3);
    document.getElementById("score-avg-label").textContent =
      `Avg Mispricing: ${avgScore}%  |  Bars = (EOM − Mid) / Mid × 100`;

    const traces = [
      {
        x: d.months,
        y: d.scores,
        name: "Mispricing %",
        type: "bar",
        marker: { color: barColors },
        hovertemplate: `%{x}<br>Score: %{y:.3f}%<extra></extra>`,
      },
    ];

    const layout = {
      ...PLOTLY_DARK,
      barmode: "relative",
      showlegend: false,
      yaxis: {
        ...PLOTLY_DARK.yaxis,
        title: "Mispricing % (EOM − Mid) / Mid",
        zeroline: true,
        zerolinecolor: "#58a6ff",
        zerolinewidth: 1.5,
      },
      title: { text: `${meta.label || id} — Monthly Mispricing Score`, font: { size: 13 } },
    };

    Plotly.newPlot(el, traces, layout, { responsive: true });
  } catch (e) {
    el.innerHTML = `<div class="error-msg">⚠ ${e.message}</div>`;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
