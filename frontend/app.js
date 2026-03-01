const DEFAULT_SERIES = [
  { id: "CPIAUCSL", label: "Inflation", subtitle: "(CPI)" },
  { id: "UNRATE", label: "Unemployment", subtitle: "(UNRATE)" },
  { id: "FEDFUNDS", label: "Fed Funds Rate", subtitle: "(FEDFUNDS)" },
  { id: "GDPC1", label: "Real GDP", subtitle: "(GDPC1)" },
  { id: "USREC", label: "Recession Indicator", subtitle: "(USREC)" },
];

const charts = new Map();
let overlayChart;
const SERIES_COLORS = {
  CPIAUCSL: "#1d4ed8",
  UNRATE: "#f97316",
  FEDFUNDS: "#16a34a",
  GDPC1: "#9333ea",
  USREC: "#0ea5e9",
};
const SERIES_INFO = {
  CPIAUCSL: "Inflation tracks how fast everyday prices are rising for consumers. Higher inflation means your money buys less over time.",
  UNRATE: "Unemployment shows the share of people who want a job but do not currently have one. Lower values usually mean a stronger job market.",
  FEDFUNDS: "The Fed Funds Rate is the main interest rate set by the Federal Reserve. It influences borrowing costs across the economy.",
  GDPC1: "Real GDP measures total economic output adjusted for inflation. Rising GDP generally means the economy is growing.",
  USREC: "This is an official recession indicator. 1 means recession period, 0 means no recession period.",
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const startInput = document.getElementById("startDate");
const endInput = document.getElementById("endDate");
const seriesList = document.getElementById("seriesList");
const overlayCanvas = document.getElementById("overlayChart");
const interpBox = document.querySelector(".interp-box");

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function buildSeriesUrl(seriesId) {
  const params = new URLSearchParams();
  if (startInput?.value) params.append("start", startInput.value);
  if (endInput?.value) params.append("end", endInput.value);
  const qs = params.toString();
  return `/api/series/${seriesId}${qs ? `?${qs}` : ""}`;
}

function renderChart(seriesId, data, canvasEl) {
  const ctx = canvasEl.getContext("2d");
  const labels = data.map((d) => formatLabel(d.date));
  const values = data.map((d) => d.value);
  const isBinary = seriesId === "USREC";
  const lineColor = (SERIES_COLORS[seriesId] || cssVar("--chart-line") || "#1d4ed8");
  const fillColor = hexToRgba(lineColor, isBinary ? 0 : 0.12);

  if (charts.has(seriesId)) {
    charts.get(seriesId).destroy();
    charts.delete(seriesId);
  }

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: seriesId,
          data: values,
          borderColor: lineColor,
          backgroundColor: fillColor,
          tension: isBinary ? 0 : 0.2,
          fill: isBinary ? false : true,
          showLine: !isBinary,
          pointRadius: isBinary ? 5 : 3,
          pointHoverRadius: isBinary ? 6 : 4,
          pointBackgroundColor: lineColor,
          pointBorderColor: lineColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 8 } },
        y: {
          suggestedMin: isBinary ? -0.2 : undefined,
          suggestedMax: isBinary ? 1.2 : undefined,
          ticks: {
            color: "#94a3b8",
            stepSize: isBinary ? 1 : undefined,
            callback: isBinary
              ? (val) => (val === 0 ? "No" : val === 1 ? "Yes" : "")
              : (val) => Number(val).toFixed(1).replace(/\.0$/, ""),
          },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => {
              const rawVal = ctx.parsed.y;
              const origDate = data[ctx.dataIndex]?.date || "";
              const valDisp = rawVal === null || rawVal === undefined
                ? "—"
                : isBinary
                  ? rawVal === 1 ? "Yes" : rawVal === 0 ? "No" : rawVal
                  : rawVal;
              return `${origDate}: ${valDisp}`;
            },
          },
        },
      },
    },
  });

  charts.set(seriesId, chart);
}

function renderOverlay(payloads) {
  if (!overlayCanvas) return;
  const labelsIso = Array.from(
    new Set(
      payloads
        .flatMap((p) => p.data.map((d) => d.date))
        .filter(Boolean)
        .sort()
    )
  );
  const labels = labelsIso.map((d) => formatLabel(d));

  const datasets = payloads.map((p, idx) => {
    const cleaned = p.data.filter((d) => d.value !== null && d.value !== undefined);
    if (!cleaned.length) return null;
    const vals = cleaned.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const valMap = new Map(cleaned.map((d) => [d.date, (d.value - min) / range]));
    const data = labelsIso.map((d) => {
      const v = valMap.get(d);
      return v === undefined ? null : v;
    });
    return {
      label: p.label,
      data,
      borderColor: SERIES_COLORS[p.id] || cssVar("--chart-line") || "#1d4ed8",
      backgroundColor: "transparent",
      tension: 0.2,
      fill: false,
      pointRadius: 0,
      spanGaps: true,
    };
  });

  const filteredDatasets = datasets.filter(Boolean);

  if (overlayChart) overlayChart.destroy();
  const ctx = overlayCanvas.getContext("2d");
  overlayChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: filteredDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#6b7280", maxTicksLimit: 8 } },
        y: {
          ticks: {
            color: "#6b7280",
            callback: (v) => Number(v).toFixed(1),
          },
          suggestedMin: 0,
          suggestedMax: 1,
          grid: { color: "rgba(15,23,42,0.06)" },
        },
      },
      plugins: {
        legend: { position: "top", labels: { color: "#0f172a" } },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? "").toFixed(2)}`,
          },
        },
      },
    },
  });
}

function formatLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function renderSeriesRow(seriesId, label, payload) {
  const data = payload.data;
  const nonNull = [...data].reverse().filter((d) => d.value !== null && d.value !== undefined);
  const latest = nonNull[0] || data[data.length - 1];
  const prev = nonNull[1] || latest;
  const latestVal = latest?.value ?? null;
  const prevVal = prev?.value ?? null;
  const change = latestVal !== null && prevVal !== null ? latestVal - prevVal : null;
  const pct = change !== null && prevVal ? (change / prevVal) * 100 : null;

  const row = document.createElement("div");
  row.className = "series-row";

  const meta = document.createElement("div");
  meta.className = "series-meta";
  const infoWrap = document.createElement("div");
  infoWrap.className = "info-wrap";
  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "info-btn";
  infoBtn.setAttribute("aria-label", `What is ${label}?`);
  infoBtn.textContent = "i";
  const infoTip = document.createElement("div");
  infoTip.className = "info-tip";
  infoTip.textContent = SERIES_INFO[seriesId] || "";
  infoWrap.append(infoBtn, infoTip);

  const title = document.createElement("h3");
  title.textContent = seriesId === "USREC" ? "Recession Indicated?" : label;
  const subtitleEl = document.createElement("div");
  subtitleEl.className = "metric-sub";
  subtitleEl.textContent = payload.subtitle || "";
  const metric = document.createElement("div");
  metric.className = "metric-value";
  const displayVal =
    seriesId === "USREC"
      ? latestVal === 1
        ? "Yes"
        : latestVal === 0
          ? "No"
          : "—"
      : formatNumber(latestVal);
  metric.textContent = displayVal;
  const foot = document.createElement("div");
  foot.className = "metric-foot";
  const deltaClass = change > 0 ? "pos" : change < 0 ? "neg" : "";
  foot.innerHTML = `
    <span class="foot-date">${latest?.date ? formatLabel(latest.date) : ""}</span>
    <span class="foot-change ${deltaClass}">Last report: ${
      seriesId === "USREC"
        ? (prevVal === 1 ? "Yes" : prevVal === 0 ? "No" : "—")
        : change !== null
          ? `${change > 0 ? "↑" : change < 0 ? "↓" : ""} ${formatNumber(change)} (${pct !== null ? pct.toFixed(2) : "—"}%)`
          : "—"
    }</span>
  `;
  meta.append(infoWrap, title, subtitleEl, metric, foot);

  const chartWrap = document.createElement("div");
  chartWrap.className = "series-chart";
  const canvas = document.createElement("canvas");
  canvas.id = `${seriesId}-chart`;
  chartWrap.appendChild(canvas);

  row.append(meta, chartWrap);
  seriesList.appendChild(row);

  renderChart(seriesId, data, canvas);
}

async function loadAllSeries() {
  try {
    seriesList.innerHTML = "";
    const payloads = await Promise.all(
      DEFAULT_SERIES.map(async ({ id, label, subtitle }) => {
        const resp = await fetchJSON(buildSeriesUrl(id));
        return { id, label, subtitle, data: resp.data };
      })
    );
    payloads.forEach((p, idx) => {
      renderSeriesRow(p.id, p.label, p);
    });
    renderOverlay(payloads);
    updateInterpretation();
  } catch (err) {
    console.error(err);
  }
}

function wireEvents() {
  startInput?.addEventListener("change", loadAllSeries);
  endInput?.addEventListener("change", loadAllSeries);
}

function init() {
  const today = new Date();
  if (startInput) {
    startInput.value = "2022-08-01";
  }
  if (endInput) endInput.value = today.toISOString().slice(0, 10);
  wireEvents();
  loadAllSeries();
}

document.addEventListener("DOMContentLoaded", init);




function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateInterpretation() {
  if (!interpBox) return;
  const sections = [
    {
      id: "CPIAUCSL",
      title: "Inflation (CPI)",
      body: "Peaks in 2022 ease through 2025-26, suggesting price pressure is cooling and daily essentials are becoming less volatile."
    },
    {
      id: "UNRATE",
      title: "Unemployment",
      body: "The range stays relatively low (about 3.5-4.3%), which supports a resilient jobs backdrop and steady household income."
    },
    {
      id: "FEDFUNDS",
      title: "Fed Funds Rate",
      body: "Rates rise aggressively in 2022-23, then flatten and soften, indicating policy shifted from tightening toward stabilization."
    },
    {
      id: "GDPC1",
      title: "Real GDP",
      body: "Output remains positive overall, pointing to slower but ongoing expansion rather than broad contraction."
    },
    {
      id: "USREC",
      title: "Recession Indicator",
      body: "The indicator does not flip to recession during this span, reinforcing that the economy avoided an official downturn."
    }
  ];

  const synthesis =
    "Synthesis: Taken together, this period looks like a soft-landing pattern - inflation cools, jobs remain stable, growth stays positive, and recession signals do not trigger.";

  const html = `
    ${sections
      .map(
        (s) => `
          <section class="interp-section">
            <div class="interp-label" style="color:${SERIES_COLORS[s.id] || "#1d4ed8"}">${s.title}</div>
            <p class="interp-body">${s.body}</p>
          </section>
        `
      )
      .join("")}
    <section class="interp-section interp-synthesis">
      <div class="interp-label" style="color:${SERIES_COLORS.CPIAUCSL}">Synthesis</div>
      <p class="interp-body">${synthesis}</p>
    </section>
  `;
  interpBox.innerHTML = html;
}
