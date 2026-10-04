/**
 * STOCKPULSE — Market Intelligence Lab
 * app.js  |  Frontend application logic
 */

"use strict";

// ─────────────────────────────────────────────────────────────────
// 0. CHART.JS GLOBAL DEFAULTS
// ─────────────────────────────────────────────────────────────────

Chart.defaults.color           = '#8B9B96';
Chart.defaults.borderColor     = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family     = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size       = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.animation.duration = 600;

const PALETTE = {
  mint:   '#55E6B0',
  cyan:   '#72D9FF',
  lime:   '#A8E87C',
  red:    '#FF6B8A',
  orange: '#F5C842',
  bg:     '#10221F',
  border: 'rgba(255,255,255,0.06)',
};

// ─────────────────────────────────────────────────────────────────
// 1. STATE
// ─────────────────────────────────────────────────────────────────

const TABLE_COLS = [
  { key: 'Date_str',     label: 'Date',         type: 'date' },
  { key: 'Open',         label: 'Open',         type: 'num' },
  { key: 'High',         label: 'High',         type: 'num' },
  { key: 'Low',          label: 'Low',          type: 'num' },
  { key: 'Close',        label: 'Close',        type: 'num' },
  { key: 'Volume',       label: 'Volume',       type: 'vol' },
  { key: 'Daily_Return', label: 'Daily Return', type: 'pct' },
  { key: 'Price_Change', label: 'Price Change', type: 'change' },
  { key: 'MA_20',        label: '20D MA',       type: 'num' },
  { key: 'MA_50',        label: '50D MA',       type: 'num' },
  { key: 'Volatility_20',label: 'Volatility',   type: 'pct' },
];

const state = {
  analysisData: null,
  charts: {},
};

// ─────────────────────────────────────────────────────────────────
// 2. DOM REFERENCES
// ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const landing          = $('landing');
const dashboard        = $('dashboard');
const topNav           = $('top-nav');
const errorPanel       = $('error-panel');
const errorList        = $('error-list');
const uploadProgress   = $('upload-progress');
const loadingOverlay   = $('loading-overlay');
const loadingText      = $('loading-text');
const dropZone         = $('drop-zone');
const fileInput        = $('file-input');

// ─────────────────────────────────────────────────────────────────
// 3. UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────

const fmt = {
  num:    v => v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
  pct:    v => v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%',
  price:  v => v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  vol:    v => {
    if (v == null) return '—';
    v = Number(v);
    if (v >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
    if (v >= 1e5) return (v / 1e5).toFixed(2) + ' L';
    return v.toLocaleString('en-IN');
  },
  date:   v => v || '—',
  fixed:  (v, d=2) => v == null ? '—' : Number(v).toFixed(d),
};

function showLoader(text = 'Processing…') {
  loadingText.textContent = text;
  loadingOverlay.classList.add('active');
}
function hideLoader() { loadingOverlay.classList.remove('active'); }

function showError(messages) {
  errorPanel.style.display = 'block';
  errorList.innerHTML = messages.map(m => `<li>${m}</li>`).join('');
  errorPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() { errorPanel.style.display = 'none'; }

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. UPLOAD PROGRESS STEPS
// ─────────────────────────────────────────────────────────────────

const STEPS = ['step-upload', 'step-validate', 'step-calculate', 'step-render'];

function resetSteps() {
  STEPS.forEach(id => {
    const el = $(id);
    if (el) { el.className = 'progress-step'; el.querySelector('.step-dot').textContent = ''; }
  });
}

function setStep(id, status /* 'active'|'done'|'error' */, icon = '') {
  const el = $(id);
  if (!el) return;
  el.className = `progress-step ${status}`;
  el.querySelector('.step-dot').textContent = icon;
}

// ─────────────────────────────────────────────────────────────────
// 5. DRAG-AND-DROP + FILE SELECTION
// ─────────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()=> { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) processFile(e.target.files[0]); });

async function processFile(file) {
  hideError();
  uploadProgress.style.display = 'block';
  resetSteps();

  // Step 1 — upload
  setStep('step-upload', 'active', '↑');
  await sleep(200);

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setStep('step-upload', 'error', '✕');
    showError(['Invalid file type. Please upload a .csv file.']);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setStep('step-upload', 'error', '✕');
    showError(['File size exceeds 10 MB limit.']);
    return;
  }

  setStep('step-upload', 'done', '✓');
  setStep('step-validate', 'active', '…');

  const formData = new FormData();
  formData.append('file', file);

  try {
    showLoader('Analysing your dataset…');
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    hideLoader();

    if (!data.success) {
      setStep('step-validate', 'error', '✕');
      showError(data.errors || ['Unknown validation error.']);
      return;
    }

    setStep('step-validate', 'done', '✓');
    setStep('step-calculate', 'active', '…');
    await sleep(300);
    setStep('step-calculate', 'done', '✓');
    setStep('step-render', 'active', '…');
    await sleep(200);

    renderDashboard(data);

    setStep('step-render', 'done', '✓');

  } catch (err) {
    hideLoader();
    setStep('step-validate', 'error', '✕');
    showError(['Could not connect to the server. Please try again.']);
  }
}

async function loadSample() {
  hideError();
  showLoader('Loading demo dataset…');
  try {
    const res  = await fetch('/sample');
    const data = await res.json();
    hideLoader();
    if (!data.success) { showError(data.errors || ['Failed to load sample dataset.']); return; }
    renderDashboard(data);
  } catch (err) {
    hideLoader();
    showError(['Could not load sample dataset. Please refresh and try again.']);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────
// 6. MAIN RENDER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────

function renderDashboard(data) {
  state.analysisData = data;
  state.currentPage  = 1;

  // Transition: hide landing, show dashboard + nav
  const landEl = $('landing');
  const dashEl = $('dashboard');
  const navEl  = $('top-nav');
  const progEl = $('upload-progress');

  if (landEl) landEl.style.display = 'none';
  if (dashEl) dashEl.style.display = 'block';
  if (navEl)  navEl.style.display  = 'block';
  if (progEl) progEl.style.display = 'none';

  // Instantly reveal all sections so they are never hidden by scroll opacity
  document.querySelectorAll('.scroll-reveal').forEach(el => el.classList.add('visible'));

  // Render all sections
  renderFormatInfo(data.format_info);
  renderQualityPanel(data.quality_report);
  renderOverview(data.overview, data.trend, data.charts.price);
  renderPipelineBanner();
  renderPriceSection(data.charts.price, data.trend);
  renderReturnSection(data.charts.returns, data.charts.histogram, data.return_stats);
  renderVolatilitySection(data.charts.volatility, data.vol_stats);
  renderVolumeSection(data.charts.volume, data.volume_stats);

  // Scroll animations
  initScrollReveal();

  // Smooth scroll to top of dashboard
    renderCorrelationSection(data.correlation);
  renderDataTable();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────
// 7. DATA QUALITY PANEL
// ─────────────────────────────────────────────────────────────────


function renderFormatInfo(formatInfo) {
  const panel = $('normalization-panel');
  if (!panel) return;

  if (formatInfo && (formatInfo.source_format !== 'Standard Format' || Object.keys(formatInfo.mappings || {}).length > 0)) {
    panel.style.display = 'block';
    const setT = (id, val) => { const el = $(id); if (el) el.textContent = val || '—'; };
    setT('fmt-source', formatInfo.source_format);
    setT('fmt-detected', (formatInfo.detected_columns || []).join(', '));
    setT('fmt-normalized', (formatInfo.normalized_columns || []).join(', '));

    if (Object.keys(formatInfo.mappings || {}).length > 0) {
      const mapsContainer = $('fmt-mappings-container');
      if (mapsContainer) mapsContainer.style.display = 'block';
      const maps = Object.entries(formatInfo.mappings).map(([k, v]) => `${k} → ${v}`).join(', ');
      setT('fmt-mappings', maps);
    } else {
      const mapsContainer = $('fmt-mappings-container');
      if (mapsContainer) mapsContainer.style.display = 'none';
    }
  } else {
    panel.style.display = 'none';
  }
}

function renderQualityPanel(report) {
  if (!report) return;

  setText('q-rows',      report.original_rows    ?? 0);
  setText('q-cols',      report.original_cols    ?? 0);
  setText('q-missing',   report.missing_values   ?? 0);
  setText('q-dupes',     report.duplicate_rows   ?? 0);
  setText('q-invalid',   report.invalid_values   ?? 0);
  setText('q-clean-rows',report.rows_after_clean ?? 0);

  applyQualityColour('q-missing', report.missing_values);
  applyQualityColour('q-dupes',   report.duplicate_rows);
  applyQualityColour('q-invalid', report.invalid_values);
}

function applyQualityColour(id, value) {
  const el = $(id);
  if (!el) return;
  el.className = 'quality-item-value ' + (value > 0 ? 'quality-warn' : 'quality-good');
}

function setText(id, value) {
  const el = $(id); if (el) el.textContent = value;
}

// ─────────────────────────────────────────────────────────────────
// 8. OVERVIEW SECTION
// ─────────────────────────────────────────────────────────────────

function renderOverview(ov, trend, priceChartData) {
  setText('ov-dataset-name', ov.dataset_name || 'Loaded Dataset');
  setText('ov-date-start',   fmt.date(ov.date_start));
  setText('ov-date-end',     fmt.date(ov.date_end));
  setText('ov-rows',         ov.total_rows);
  setText('ov-last-close',   fmt.price(ov.last_close));
  setText('ov-high',         fmt.price(ov.all_time_high));
  setText('ov-low',          fmt.price(ov.all_time_low));
  setText('ov-avg-return',   fmt.pct(ov.avg_return));
  setText('ov-volatility',   fmt.fixed(ov.current_vol, 2) + '%');
  setText('ov-volume',       fmt.vol(ov.total_volume));

  const trendEl = $('ov-trend');
  if (trendEl && trend) {
    trendEl.textContent = trend.direction;
    trendEl.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
  }

  // Draw sparkline inside last-close card
  if (priceChartData && priceChartData.close) {
    drawSparkline('sparkline-close', priceChartData.close.filter(v=>v!=null), PALETTE.mint);
    drawSparkline('sparkline-vol',   (state.analysisData.charts.volume?.volume || []).filter(v=>v!=null), PALETTE.cyan);
  }
}

function drawSparkline(canvasId, data, color) {
  const canvas = $(canvasId);
  if (!canvas || data.length < 2) return;
  const ctx   = canvas.getContext('2d');
  const w     = canvas.offsetWidth  || canvas.width;
  const h     = canvas.offsetHeight || canvas.height;
  canvas.width  = w;
  canvas.height = h;
  ctx.clearRect(0,0,w,h);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step  = w / (data.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill gradient
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, color + '30');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────────
// 9. PIPELINE BANNER
// ─────────────────────────────────────────────────────────────────

function renderPipelineBanner() {
  const steps = ['DATA','CLEAN','TRANSFORM','ANALYZE','VISUALIZE','INSIGHTS'];
  const container = $('pipeline-steps');
  if (!container) return;
  container.innerHTML = steps.map((s, i) => `
    <div class="pipe-step">
      <span class="pipe-label active" style="animation-delay:${i*0.08}s">${s}</span>
      ${i < steps.length - 1 ? '<span class="pipe-arrow">→</span>' : ''}
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────
// 10. PRICE SECTION
// ─────────────────────────────────────────────────────────────────

let priceActiveFields = { close: true, open: false, high: false, low: false };
let priceActiveMA     = { ma20: false, ma50: false };
let priceRange        = 'ALL';

function renderPriceSection(chartData, trend) {
  setText('price-trend-dir',      trend.direction);
  setText('price-trend-strength', fmt.fixed(trend.strength, 1) + '%');
  setText('price-high',           fmt.price(trend.highest_price) + ' — ' + fmt.date(trend.highest_date));
  setText('price-low',            fmt.price(trend.lowest_price)  + ' — ' + fmt.date(trend.lowest_date));
  setText('price-change-pct',     fmt.pct(trend.total_change_pct));

  const trendBadge = $('price-trend-badge');
  if (trendBadge) {
    trendBadge.textContent = trend.direction;
    trendBadge.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
  }

  buildPriceChart(chartData, 'ALL');

  // Field toggles
  document.querySelectorAll('[data-price-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.priceField;
      priceActiveFields[field] = !priceActiveFields[field];
      btn.classList.toggle('active', priceActiveFields[field]);
      updatePriceChart();
    });
  });

  // MA toggles
  document.querySelectorAll('[data-ma]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ma = btn.dataset.ma;
      priceActiveMA[ma] = !priceActiveMA[ma];
      btn.classList.toggle('active', priceActiveMA[ma]);
      updatePriceChart();
    });
  });

  // Range buttons
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      priceRange = btn.dataset.range;
      buildPriceChart(chartData, priceRange);
    });
  });
}

function sliceByRange(dates, arrays, range) {
  const n = dates.length;
  const cuts = { '1D':1, '1W':5, '1M':22, '3M':66, '6M':132, '1Y':252, 'ALL':n };
  const count = Math.min(cuts[range] || n, n);
  const start = n - count;
  return {
    dates: dates.slice(start),
    arrays: arrays.map(a => a ? a.slice(start) : a),
  };
}

function buildPriceChart(chartData, range) {
  destroyChart('price');
  const { dates, arrays } = sliceByRange(
    chartData.dates,
    [chartData.close, chartData.open, chartData.high, chartData.low, chartData.ma20, chartData.ma50],
    range
  );
  const [close, open, high, low, ma20, ma50] = arrays;

  const datasets = [];
  if (priceActiveFields.close || true) { // always show close by default
    datasets.push(makeLineDataset('Close', close, PALETTE.mint, 2));
  }
  if (priceActiveFields.open)  datasets.push(makeLineDataset('Open',  open,  PALETTE.cyan,   1.5, [4,2]));
  if (priceActiveFields.high)  datasets.push(makeLineDataset('High',  high,  PALETTE.lime,   1.5, [4,2]));
  if (priceActiveFields.low)   datasets.push(makeLineDataset('Low',   low,   PALETTE.orange, 1.5, [4,2]));
  if (priceActiveMA.ma20)  datasets.push(makeLineDataset('20D MA', ma20, '#b07aff', 1.5, [6,3]));
  if (priceActiveMA.ma50)  datasets.push(makeLineDataset('50D MA', ma50, '#ff9f5a', 1.5, [6,3]));

  const priceEl = $('price-chart'); if (!priceEl) return; const ctx = priceEl.getContext('2d');
  state.charts.price = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: chartOptions('Price (₹)', '', true),
  });
}

function updatePriceChart() {
  if (!state.analysisData) return;
  buildPriceChart(state.analysisData.charts.price, priceRange);
}

// ─────────────────────────────────────────────────────────────────
// 11. RETURNS SECTION
// ─────────────────────────────────────────────────────────────────

function renderReturnSection(chartData, histData, returnStats) {
  if (!returnStats) return;
  setText('ret-avg',      fmt.pct(returnStats.average));
  setText('ret-max-gain', fmt.pct(returnStats.max_gain) + ' (' + fmt.date(returnStats.max_gain_date) + ')');
  setText('ret-max-loss', fmt.pct(returnStats.max_loss) + ' (' + fmt.date(returnStats.max_loss_date) + ')');
  setText('ret-std',      fmt.fixed(returnStats.std, 4) + '%');
  setText('ret-pos-pct',  returnStats.pct_positive + '%');
  setText('ret-neg-pct',  returnStats.pct_negative + '%');
  setText('ret-within2',  returnStats.within_2pct + '%');

  // Daily Returns Line Chart
  const lineCanvas = $('returns-chart');
  if (lineCanvas && chartData) {
    destroyChart('returns');
    const ctx = lineCanvas.getContext('2d');
    state.charts.returns = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.dates,
        datasets: [{
          label: 'Daily Return (%)',
          data: chartData.returns,
          borderColor: PALETTE.mint,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2
        }]
      },
      options: defaultChartOptions('Return (%)', '')
    });
  }

  // Return Histogram
  const histCanvas = $('histogram-chart');
  if (histCanvas && histData) {
    destroyChart('histogram');
    const ctx = histCanvas.getContext('2d');
    state.charts.histogram = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: histData.bin_centers.map(v => fmt.fixed(v, 2) + '%'),
        datasets: [{
          label: 'Frequency',
          data: histData.counts,
          backgroundColor: PALETTE.cyan + '88',
          borderColor: PALETTE.cyan,
          borderWidth: 1,
          borderRadius: 2,
        }]
      },
      options: defaultChartOptions('Frequency', 'Return (%)')
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// 12. VOLATILITY SECTION
// ─────────────────────────────────────────────────────────────────

function renderVolatilitySection(chartData, volStats) {
  setText('vol-current',   fmt.fixed(volStats.current, 2) + '%');
  setText('vol-average',   fmt.fixed(volStats.average, 2) + '%');
  setText('vol-maximum',   fmt.fixed(volStats.maximum, 2) + '%');
  setText('vol-minimum',   fmt.fixed(volStats.minimum, 2) + '%');
  setText('vol-annualised',fmt.fixed(volStats.annualised, 2) + '%');

  const badge = $('vol-status-badge');
  if (badge) {
    badge.textContent = volStats.status;
    badge.className   = 'status-badge status-' + (volStats.status || '').toLowerCase();
  }

  // High vol dates
  const list = $('high-vol-dates');
  if (list && volStats.high_vol_dates) {
    list.innerHTML = volStats.high_vol_dates.map(d => `
      <div class="vol-date-row">
        <span class="date">${fmt.date(d.Date_str)}</span>
        <span class="vol">${fmt.fixed(d.volatility, 2)}%</span>
      </div>
    `).join('');
  }

  // Chart
  destroyChart('volatility');
  const volEl = $('volatility-chart'); if (!volEl) return; const ctx = volEl.getContext('2d');

  // Add average line
  const avgLine = chartData.volatility.map(() => volStats.average);
  const grad    = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, PALETTE.orange + '40');
  grad.addColorStop(1, 'transparent');

  state.charts.volatility = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.dates,
      datasets: [
        {
          label: '20D Rolling Volatility (%)',
          data: chartData.volatility,
          borderColor: PALETTE.orange,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Average Volatility',
          data: avgLine,
          borderColor: PALETTE.cyan + '80',
          borderDash: [5,3],
          fill: false,
          pointRadius: 0,
          borderWidth: 1,
        },
      ],
    },
    options: chartOptions('Volatility (%)', ''),
  });
}

// ─────────────────────────────────────────────────────────────────
// 13. VOLUME SECTION
// ─────────────────────────────────────────────────────────────────

function renderVolumeSection(chartData, volumeStats) {
  setText('vol-avg',      fmt.vol(volumeStats.average));
  setText('vol-highest',  fmt.vol(volumeStats.highest_volume) + ' — ' + fmt.date(volumeStats.highest_date));
  setText('vol-lowest',   fmt.vol(volumeStats.lowest_volume)  + ' — ' + fmt.date(volumeStats.lowest_date));

  // Average line
  const avgLine = chartData.volume.map(() => volumeStats.average);
  const threshold = volumeStats.average + 0.5 * (volumeStats.highest_volume - volumeStats.average);
  const volColors = chartData.volume.map(v => (v != null && v > threshold) ? PALETTE.cyan + 'cc' : PALETTE.mint + '55');

  destroyChart('volume');
  const volumeEl = $('volume-chart'); if (!volumeEl) return; const ctx = volumeEl.getContext('2d');
  state.charts.volume = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.dates,
      datasets: [
        {
          label: 'Volume',

          data: chartData.volume,
          backgroundColor: volColors,
          borderWidth: 0,
          borderRadius: 1,
          order: 2,
        },
        {
          label: 'Avg Volume',
          data: avgLine,
          type: 'line',
          borderColor: PALETTE.orange + 'aa',
          borderDash: [5,3],
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
          order: 1,
        },
      ],
    },
    options: chartOptions('Volume (Shares)', ''),
  });

  // Price vs Volume chart
  
  html += `<button class="page-btn" onclick="gotoPage(${state.currentPage+1})" ${state.currentPage===totalPages?'disabled':''}>›</button>`;
  html += `<span class="page-info">${state.currentPage} / ${totalPages}</span>`;
  pg.innerHTML = html;
}

function pageRange(current, total, delta) {
  const range = [];
  const left  = current - delta;
  const right = current + delta + 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= left && i < right)) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  return range;
}

;

;

// Search
const searchInput = $('table-search');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    state.tableFiltered = q
      ? state.tableData.filter(row => Object.values(row).some(v => String(v || '').toLowerCase().includes(q)))
      : [...state.tableData];
    state.currentPage = 1;
    });
}

// Download
const dlBtn = $('download-btn');
if (dlBtn) {
  dlBtn.addEventListener('click', () => {
    window.location.href = '/download';
  });
}

// ─────────────────────────────────────────────────────────────────
// 17. CHART HELPER FACTORIES
// ─────────────────────────────────────────────────────────────────

function makeLineDataset(label, data, color, lineWidth = 2, dash = []) {
  return {
    label,
    data,
    borderColor:     color,
    backgroundColor: 'transparent',
    fill:            false,
    tension:         0.3,
    pointRadius:     0,
    pointHitRadius:  8,
    borderWidth:     lineWidth,
    borderDash:      dash,
  };
}

function defaultXAxis() {
  return {
    grid:  { color: PALETTE.border },
    ticks: { color: '#8B9B96', maxTicksLimit: 10, maxRotation: 0 },
    border:{ color: PALETTE.border },
  };
}

function defaultYAxis() {
  return {
    grid:  { color: PALETTE.border },
    ticks: { color: '#8B9B96' },
    border:{ color: PALETTE.border },
  };
}

function chartOptions(yLabel = '', xLabel = '', showLegend = false) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        align: 'end',
        labels: { color: '#8B9B96', boxWidth: 10, usePointStyle: true, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(13,25,23,0.95)',
        borderColor:     PALETTE.border,
        borderWidth:     1,
        titleColor:      '#F2F7F5',
        bodyColor:       '#8B9B96',
        padding:         12,
        cornerRadius:    6,
      },
    },
    scales: {
      x: defaultXAxis(),
      y: defaultYAxis(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// 18. SCROLL REVEAL
// ─────────────────────────────────────────────────────────────────

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.08 });

  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// ─────────────────────────────────────────────────────────────────
// 19. NAV SCROLL SPY
// ─────────────────────────────────────────────────────────────────

function initScrollSpy() {
  const sections = document.querySelectorAll('.analysis-section[id]');
  const links    = document.querySelectorAll('.nav-links a[href^="#"]');

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-links a[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });

  sections.forEach(s => obs.observe(s));
}

// ─────────────────────────────────────────────────────────────────
// 20. MOBILE NAV
// ─────────────────────────────────────────────────────────────────

const hamburger         = $('hamburger');
const mobileNavDrawer   = $('mobile-nav-drawer');
const mobileNavOverlay  = $('mobile-nav-overlay');

if (hamburger && mobileNavDrawer && mobileNavOverlay) {
  hamburger.addEventListener('click', () => {
    mobileNavDrawer.classList.toggle('open');
    mobileNavOverlay.classList.toggle('open');
  });
  mobileNavOverlay.addEventListener('click', () => {
    mobileNavDrawer.classList.remove('open');
    mobileNavOverlay.classList.remove('open');
  });
  mobileNavDrawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileNavDrawer.classList.remove('open');
      mobileNavOverlay.classList.remove('open');
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// 21. COLLAPSIBLES
// ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => {
    const body  = h.nextElementSibling;
    const arrow = h.querySelector('.coll-arrow');
    body.classList.toggle('open');
    if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
  });
});

// ─────────────────────────────────────────────────────────────────
// 22. INIT
// ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initScrollSpy();

  // "Explore Sample Dataset" button
  const sampleBtn = $('sample-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSample);

  // "Upload CSV" button on landing
  const uploadBtn = $('upload-landing-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      dropZone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // "Load Another Dataset" button on dashboard
  const reloadBtn = $('reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      landing.style.display   = 'flex';
      dashboard.style.display = 'none';
      topNav.style.display    = 'none';
      uploadProgress.style.display = 'none';
      hideError();
      fileInput.value = '';
      window.scrollTo({ top: 0 });
    });
  }
});



window.loadSample = loadSample;state.analysisData = data;
  state.tableData = data.table || [];
  state.tableFiltered = [...state.tableData];
Intelligence Lab
 * app.js  |  Frontend application logic
 */

"use strict";

// ─────────────────────────────────────────────────────────────────
// 0. CHART.JS GLOBAL DEFAULTS
// ─────────────────────────────────────────────────────────────────

Chart.defaults.color           = '#8B9B96';
Chart.defaults.borderColor     = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family     = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size       = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.animation.duration = 600;

const PALETTE = {
  mint:   '#55E6B0',
  cyan:   '#72D9FF',
  lime:   '#A8E87C',
  red:    '#FF6B8A',
  orange: '#F5C842',
  bg:     '#10221F',
  border: 'rgba(255,255,255,0.06)',
};

// ─────────────────────────────────────────────────────────────────
// 1. STATE
// ─────────────────────────────────────────────────────────────────

const TABLE_COLS = [
  { key: 'Date_str',     label: 'Date',         type: 'date' },
  { key: 'Open',         label: 'Open',         type: 'num' },
  { key: 'High',         label: 'High',         type: 'num' },
  { key: 'Low',          label: 'Low',          type: 'num' },
  { key: 'Close',        label: 'Close',        type: 'num' },
  { key: 'Volume',       label: 'Volume',       type: 'vol' },
  { key: 'Daily_Return', label: 'Daily Return', type: 'pct' },
  { key: 'Price_Change', label: 'Price Change', type: 'change' },
  { key: 'MA_20',        label: '20D MA',       type: 'num' },
  { key: 'MA_50',        label: '50D MA',       type: 'num' },
  { key: 'Volatility_20',label: 'Volatility',   type: 'pct' },
];

const state = {
  analysisData: null,
  charts: {},
};

// ─────────────────────────────────────────────────────────────────
// 2. DOM REFERENCES
// ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const landing          = $('landing');
const dashboard        = $('dashboard');
const topNav           = $('top-nav');
const errorPanel       = $('error-panel');
const errorList        = $('error-list');
const uploadProgress   = $('upload-progress');
const loadingOverlay   = $('loading-overlay');
const loadingText      = $('loading-text');
const dropZone         = $('drop-zone');
const fileInput        = $('file-input');

// ─────────────────────────────────────────────────────────────────
// 3. UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────

const fmt = {
  num:    v => v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
  pct:    v => v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%',
  price:  v => v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  vol:    v => {
    if (v == null) return '—';
    v = Number(v);
    if (v >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
    if (v >= 1e5) return (v / 1e5).toFixed(2) + ' L';
    return v.toLocaleString('en-IN');
  },
  date:   v => v || '—',
  fixed:  (v, d=2) => v == null ? '—' : Number(v).toFixed(d),
};

function showLoader(text = 'Processing…') {
  loadingText.textContent = text;
  loadingOverlay.classList.add('active');
}
function hideLoader() { loadingOverlay.classList.remove('active'); }

function showError(messages) {
  errorPanel.style.display = 'block';
  errorList.innerHTML = messages.map(m => `<li>${m}</li>`).join('');
  errorPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() { errorPanel.style.display = 'none'; }

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. UPLOAD PROGRESS STEPS
// ─────────────────────────────────────────────────────────────────

const STEPS = ['step-upload', 'step-validate', 'step-calculate', 'step-render'];

function resetSteps() {
  STEPS.forEach(id => {
    const el = $(id);
    if (el) { el.className = 'progress-step'; el.querySelector('.step-dot').textContent = ''; }
  });
}

function setStep(id, status /* 'active'|'done'|'error' */, icon = '') {
  const el = $(id);
  if (!el) return;
  el.className = `progress-step ${status}`;
  el.querySelector('.step-dot').textContent = icon;
}

// ─────────────────────────────────────────────────────────────────
// 5. DRAG-AND-DROP + FILE SELECTION
// ─────────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()=> { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) processFile(e.target.files[0]); });

async function processFile(file) {
  hideError();
  uploadProgress.style.display = 'block';
  resetSteps();

  // Step 1 — upload
  setStep('step-upload', 'active', '↑');
  await sleep(200);

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setStep('step-upload', 'error', '✕');
    showError(['Invalid file type. Please upload a .csv file.']);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setStep('step-upload', 'error', '✕');
    showError(['File size exceeds 10 MB limit.']);
    return;
  }

  setStep('step-upload', 'done', '✓');
  setStep('step-validate', 'active', '…');

  const formData = new FormData();
  formData.append('file', file);

  try {
    showLoader('Analysing your dataset…');
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    hideLoader();

    if (!data.success) {
      setStep('step-validate', 'error', '✕');
      showError(data.errors || ['Unknown validation error.']);
      return;
    }

    setStep('step-validate', 'done', '✓');
    setStep('step-calculate', 'active', '…');
    await sleep(300);
    setStep('step-calculate', 'done', '✓');
    setStep('step-render', 'active', '…');
    await sleep(200);

    renderDashboard(data);

    setStep('step-render', 'done', '✓');

  } catch (err) {
    hideLoader();
    setStep('step-validate', 'error', '✕');
    showError(['Could not connect to the server. Please try again.']);
  }
}

async function loadSample() {
  hideError();
  showLoader('Loading demo dataset…');
  try {
    const res  = await fetch('/sample');
    const data = await res.json();
    hideLoader();
    if (!data.success) { showError(data.errors || ['Failed to load sample dataset.']); return; }
    renderDashboard(data);
  } catch (err) {
    hideLoader();
    showError(['Could not load sample dataset. Please refresh and try again.']);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────
// 6. MAIN RENDER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────

function renderDashboard(data) {
  state.analysisData = data;
  state.currentPage  = 1;

  // Transition: hide landing, show dashboard + nav
  const landEl = $('landing');
  const dashEl = $('dashboard');
  const navEl  = $('top-nav');
  const progEl = $('upload-progress');

  if (landEl) landEl.style.display = 'none';
  if (dashEl) dashEl.style.display = 'block';
  if (navEl)  navEl.style.display  = 'block';
  if (progEl) progEl.style.display = 'none';

  // Instantly reveal all sections so they are never hidden by scroll opacity
  document.querySelectorAll('.scroll-reveal').forEach(el => el.classList.add('visible'));

  // Render all sections
  renderFormatInfo(data.format_info);
  renderQualityPanel(data.quality_report);
  renderOverview(data.overview, data.trend, data.charts.price);
  renderPipelineBanner();
  renderPriceSection(data.charts.price, data.trend);
  renderReturnSection(data.charts.returns, data.charts.histogram, data.return_stats);
  renderVolatilitySection(data.charts.volatility, data.vol_stats);
  renderVolumeSection(data.charts.volume, data.volume_stats);

  // Scroll animations
  initScrollReveal();

  // Smooth scroll to top of dashboard
    renderCorrelationSection(data.correlation);
  renderDataTable();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────
// 7. DATA QUALITY PANEL
// ─────────────────────────────────────────────────────────────────


function renderFormatInfo(formatInfo) {
  const panel = $('normalization-panel');
  if (!panel) return;

  if (formatInfo && (formatInfo.source_format !== 'Standard Format' || Object.keys(formatInfo.mappings || {}).length > 0)) {
    panel.style.display = 'block';
    const setT = (id, val) => { const el = $(id); if (el) el.textContent = val || '—'; };
    setT('fmt-source', formatInfo.source_format);
    setT('fmt-detected', (formatInfo.detected_columns || []).join(', '));
    setT('fmt-normalized', (formatInfo.normalized_columns || []).join(', '));

    if (Object.keys(formatInfo.mappings || {}).length > 0) {
      const mapsContainer = $('fmt-mappings-container');
      if (mapsContainer) mapsContainer.style.display = 'block';
      const maps = Object.entries(formatInfo.mappings).map(([k, v]) => `${k} → ${v}`).join(', ');
      setT('fmt-mappings', maps);
    } else {
      const mapsContainer = $('fmt-mappings-container');
      if (mapsContainer) mapsContainer.style.display = 'none';
    }
  } else {
    panel.style.display = 'none';
  }
}

function renderQualityPanel(report) {
  if (!report) return;

  setText('q-rows',      report.original_rows    ?? 0);
  setText('q-cols',      report.original_cols    ?? 0);
  setText('q-missing',   report.missing_values   ?? 0);
  setText('q-dupes',     report.duplicate_rows   ?? 0);
  setText('q-invalid',   report.invalid_values   ?? 0);
  setText('q-clean-rows',report.rows_after_clean ?? 0);

  applyQualityColour('q-missing', report.missing_values);
  applyQualityColour('q-dupes',   report.duplicate_rows);
  applyQualityColour('q-invalid', report.invalid_values);
}

function applyQualityColour(id, value) {
  const el = $(id);
  if (!el) return;
  el.className = 'quality-item-value ' + (value > 0 ? 'quality-warn' : 'quality-good');
}

function setText(id, value) {
  const el = $(id); if (el) el.textContent = value;
}

// ─────────────────────────────────────────────────────────────────
// 8. OVERVIEW SECTION
// ─────────────────────────────────────────────────────────────────

function renderOverview(ov, trend, priceChartData) {
  setText('ov-dataset-name', ov.dataset_name || 'Loaded Dataset');
  setText('ov-date-start',   fmt.date(ov.date_start));
  setText('ov-date-end',     fmt.date(ov.date_end));
  setText('ov-rows',         ov.total_rows);
  setText('ov-last-close',   fmt.price(ov.last_close));
  setText('ov-high',         fmt.price(ov.all_time_high));
  setText('ov-low',          fmt.price(ov.all_time_low));
  setText('ov-avg-return',   fmt.pct(ov.avg_return));
  setText('ov-volatility',   fmt.fixed(ov.current_vol, 2) + '%');
  setText('ov-volume',       fmt.vol(ov.total_volume));

  const trendEl = $('ov-trend');
  if (trendEl && trend) {
    trendEl.textContent = trend.direction;
    trendEl.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
  }

  // Draw sparkline inside last-close card
  if (priceChartData && priceChartData.close) {
    drawSparkline('sparkline-close', priceChartData.close.filter(v=>v!=null), PALETTE.mint);
    drawSparkline('sparkline-vol',   (state.analysisData.charts.volume?.volume || []).filter(v=>v!=null), PALETTE.cyan);
  }
}

function drawSparkline(canvasId, data, color) {
  const canvas = $(canvasId);
  if (!canvas || data.length < 2) return;
  const ctx   = canvas.getContext('2d');
  const w     = canvas.offsetWidth  || canvas.width;
  const h     = canvas.offsetHeight || canvas.height;
  canvas.width  = w;
  canvas.height = h;
  ctx.clearRect(0,0,w,h);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step  = w / (data.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill gradient
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, color + '30');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────────
// 9. PIPELINE BANNER
// ─────────────────────────────────────────────────────────────────

function renderPipelineBanner() {
  const steps = ['DATA','CLEAN','TRANSFORM','ANALYZE','VISUALIZE','INSIGHTS'];
  const container = $('pipeline-steps');
  if (!container) return;
  container.innerHTML = steps.map((s, i) => `
    <div class="pipe-step">
      <span class="pipe-label active" style="animation-delay:${i*0.08}s">${s}</span>
      ${i < steps.length - 1 ? '<span class="pipe-arrow">→</span>' : ''}
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────
// 10. PRICE SECTION
// ─────────────────────────────────────────────────────────────────

let priceActiveFields = { close: true, open: false, high: false, low: false };
let priceActiveMA     = { ma20: false, ma50: false };
let priceRange        = 'ALL';

function renderPriceSection(chartData, trend) {
  setText('price-trend-dir',      trend.direction);
  setText('price-trend-strength', fmt.fixed(trend.strength, 1) + '%');
  setText('price-high',           fmt.price(trend.highest_price) + ' — ' + fmt.date(trend.highest_date));
  setText('price-low',            fmt.price(trend.lowest_price)  + ' — ' + fmt.date(trend.lowest_date));
  setText('price-change-pct',     fmt.pct(trend.total_change_pct));

  const trendBadge = $('price-trend-badge');
  if (trendBadge) {
    trendBadge.textContent = trend.direction;
    trendBadge.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
  }

  buildPriceChart(chartData, 'ALL');

  // Field toggles
  document.querySelectorAll('[data-price-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.priceField;
      priceActiveFields[field] = !priceActiveFields[field];
      btn.classList.toggle('active', priceActiveFields[field]);
      updatePriceChart();
    });
  });

  // MA toggles
  document.querySelectorAll('[data-ma]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ma = btn.dataset.ma;
      priceActiveMA[ma] = !priceActiveMA[ma];
      btn.classList.toggle('active', priceActiveMA[ma]);
      updatePriceChart();
    });
  });

  // Range buttons
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      priceRange = btn.dataset.range;
      buildPriceChart(chartData, priceRange);
    });
  });
}

function sliceByRange(dates, arrays, range) {
  const n = dates.length;
  const cuts = { '1D':1, '1W':5, '1M':22, '3M':66, '6M':132, '1Y':252, 'ALL':n };
  const count = Math.min(cuts[range] || n, n);
  const start = n - count;
  return {
    dates: dates.slice(start),
    arrays: arrays.map(a => a ? a.slice(start) : a),
  };
}

function buildPriceChart(chartData, range) {
  destroyChart('price');
  const { dates, arrays } = sliceByRange(
    chartData.dates,
    [chartData.close, chartData.open, chartData.high, chartData.low, chartData.ma20, chartData.ma50],
    range
  );
  const [close, open, high, low, ma20, ma50] = arrays;

  const datasets = [];
  if (priceActiveFields.close || true) { // always show close by default
    datasets.push(makeLineDataset('Close', close, PALETTE.mint, 2));
  }
  if (priceActiveFields.open)  datasets.push(makeLineDataset('Open',  open,  PALETTE.cyan,   1.5, [4,2]));
  if (priceActiveFields.high)  datasets.push(makeLineDataset('High',  high,  PALETTE.lime,   1.5, [4,2]));
  if (priceActiveFields.low)   datasets.push(makeLineDataset('Low',   low,   PALETTE.orange, 1.5, [4,2]));
  if (priceActiveMA.ma20)  datasets.push(makeLineDataset('20D MA', ma20, '#b07aff', 1.5, [6,3]));
  if (priceActiveMA.ma50)  datasets.push(makeLineDataset('50D MA', ma50, '#ff9f5a', 1.5, [6,3]));

  const priceEl = $('price-chart'); if (!priceEl) return; const ctx = priceEl.getContext('2d');
  state.charts.price = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: chartOptions('Price (₹)', '', true),
  });
}

function updatePriceChart() {
  if (!state.analysisData) return;
  buildPriceChart(state.analysisData.charts.price, priceRange);
}

// ─────────────────────────────────────────────────────────────────
// 11. RETURNS SECTION
// ─────────────────────────────────────────────────────────────────

function renderReturnSection(chartData, histData, returnStats) {
  if (!returnStats) return;
  setText('ret-avg',      fmt.pct(returnStats.average));
  setText('ret-max-gain', fmt.pct(returnStats.max_gain) + ' (' + fmt.date(returnStats.max_gain_date) + ')');
  setText('ret-max-loss', fmt.pct(returnStats.max_loss) + ' (' + fmt.date(returnStats.max_loss_date) + ')');
  setText('ret-std',      fmt.fixed(returnStats.std, 4) + '%');
  setText('ret-pos-pct',  returnStats.pct_positive + '%');
  setText('ret-neg-pct',  returnStats.pct_negative + '%');
  setText('ret-within2',  returnStats.within_2pct + '%');

  // Daily Returns Line Chart
  const lineCanvas = $('returns-chart');
  if (lineCanvas && chartData) {
    destroyChart('returns');
    const ctx = lineCanvas.getContext('2d');
    state.charts.returns = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.dates,
        datasets: [{
          label: 'Daily Return (%)',
          data: chartData.returns,
          borderColor: PALETTE.mint,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2
        }]
      },
      options: defaultChartOptions('Return (%)', '')
    });
  }

  // Return Histogram
  const histCanvas = $('histogram-chart');
  if (histCanvas && histData) {
    destroyChart('histogram');
    const ctx = histCanvas.getContext('2d');
    state.charts.histogram = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: histData.bin_centers.map(v => fmt.fixed(v, 2) + '%'),
        datasets: [{
          label: 'Frequency',
          data: histData.counts,
          backgroundColor: PALETTE.cyan + '88',
          borderColor: PALETTE.cyan,
          borderWidth: 1,
          borderRadius: 2,
        }]
      },
      options: defaultChartOptions('Frequency', 'Return (%)')
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// 12. VOLATILITY SECTION
// ─────────────────────────────────────────────────────────────────

function renderVolatilitySection(chartData, volStats) {
  setText('vol-current',   fmt.fixed(volStats.current, 2) + '%');
  setText('vol-average',   fmt.fixed(volStats.average, 2) + '%');
  setText('vol-maximum',   fmt.fixed(volStats.maximum, 2) + '%');
  setText('vol-minimum',   fmt.fixed(volStats.minimum, 2) + '%');
  setText('vol-annualised',fmt.fixed(volStats.annualised, 2) + '%');

  const badge = $('vol-status-badge');
  if (badge) {
    badge.textContent = volStats.status;
    badge.className   = 'status-badge status-' + (volStats.status || '').toLowerCase();
  }

  // High vol dates
  const list = $('high-vol-dates');
  if (list && volStats.high_vol_dates) {
    list.innerHTML = volStats.high_vol_dates.map(d => `
      <div class="vol-date-row">
        <span class="date">${fmt.date(d.Date_str)}</span>
        <span class="vol">${fmt.fixed(d.volatility, 2)}%</span>
      </div>
    `).join('');
  }

  // Chart
  destroyChart('volatility');
  const volEl = $('volatility-chart'); if (!volEl) return; const ctx = volEl.getContext('2d');

  // Add average line
  const avgLine = chartData.volatility.map(() => volStats.average);
  const grad    = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, PALETTE.orange + '40');
  grad.addColorStop(1, 'transparent');

  state.charts.volatility = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.dates,
      datasets: [
        {
          label: '20D Rolling Volatility (%)',
          data: chartData.volatility,
          borderColor: PALETTE.orange,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Average Volatility',
          data: avgLine,
          borderColor: PALETTE.cyan + '80',
          borderDash: [5,3],
          fill: false,
          pointRadius: 0,
          borderWidth: 1,
        },
      ],
    },
    options: chartOptions('Volatility (%)', ''),
  });
}

// ─────────────────────────────────────────────────────────────────
// 13. VOLUME SECTION
// ─────────────────────────────────────────────────────────────────

function renderVolumeSection(chartData, volumeStats) {
  setText('vol-avg',      fmt.vol(volumeStats.average));
  setText('vol-highest',  fmt.vol(volumeStats.highest_volume) + ' — ' + fmt.date(volumeStats.highest_date));
  setText('vol-lowest',   fmt.vol(volumeStats.lowest_volume)  + ' — ' + fmt.date(volumeStats.lowest_date));

  // Average line
  const avgLine = chartData.volume.map(() => volumeStats.average);
  const threshold = volumeStats.average + 0.5 * (volumeStats.highest_volume - volumeStats.average);
  const volColors = chartData.volume.map(v => (v != null && v > threshold) ? PALETTE.cyan + 'cc' : PALETTE.mint + '55');

  destroyChart('volume');
  const volumeEl = $('volume-chart'); if (!volumeEl) return; const ctx = volumeEl.getContext('2d');
  state.charts.volume = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.dates,
      datasets: [
        {
          label: 'Volume',

          data: chartData.volume,
          backgroundColor: volColors,
          borderWidth: 0,
          borderRadius: 1,
          order: 2,
        },
        {
          label: 'Avg Volume',
          data: avgLine,
          type: 'line',
          borderColor: PALETTE.orange + 'aa',
          borderDash: [5,3],
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
          order: 1,
        },
      ],
    },
    options: chartOptions('Volume (Shares)', ''),
  });

  // Price vs Volume chart
  
  html += `<button class="page-btn" onclick="gotoPage(${state.currentPage+1})" ${state.currentPage===totalPages?'disabled':''}>›</button>`;
  html += `<span class="page-info">${state.currentPage} / ${totalPages}</span>`;
  pg.innerHTML = html;
}

function pageRange(current, total, delta) {
  const range = [];
  const left  = current - delta;
  const right = current + delta + 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= left && i < right)) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  return range;
}

;

;

// Search
const searchInput = $('table-search');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    state.tableFiltered = q
      ? state.tableData.filter(row => Object.values(row).some(v => String(v || '').toLowerCase().includes(q)))
      : [...state.tableData];
    state.currentPage = 1;
    });
}

// Download
const dlBtn = $('download-btn');
if (dlBtn) {
  dlBtn.addEventListener('click', () => {
    window.location.href = '/download';
  });
}

// ─────────────────────────────────────────────────────────────────
// 17. CHART HELPER FACTORIES
// ─────────────────────────────────────────────────────────────────

function makeLineDataset(label, data, color, lineWidth = 2, dash = []) {
  return {
    label,
    data,
    borderColor:     color,
    backgroundColor: 'transparent',
    fill:            false,
    tension:         0.3,
    pointRadius:     0,
    pointHitRadius:  8,
    borderWidth:     lineWidth,
    borderDash:      dash,
  };
}

function defaultXAxis() {
  return {
    grid:  { color: PALETTE.border },
    ticks: { color: '#8B9B96', maxTicksLimit: 10, maxRotation: 0 },
    border:{ color: PALETTE.border },
  };
}

function defaultYAxis() {
  return {
    grid:  { color: PALETTE.border },
    ticks: { color: '#8B9B96' },
    border:{ color: PALETTE.border },
  };
}

function chartOptions(yLabel = '', xLabel = '', showLegend = false) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        align: 'end',
        labels: { color: '#8B9B96', boxWidth: 10, usePointStyle: true, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(13,25,23,0.95)',
        borderColor:     PALETTE.border,
        borderWidth:     1,
        titleColor:      '#F2F7F5',
        bodyColor:       '#8B9B96',
        padding:         12,
        cornerRadius:    6,
      },
    },
    scales: {
      x: defaultXAxis(),
      y: defaultYAxis(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// 18. SCROLL REVEAL
// ─────────────────────────────────────────────────────────────────

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.08 });

  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// ─────────────────────────────────────────────────────────────────
// 19. NAV SCROLL SPY
// ─────────────────────────────────────────────────────────────────

function initScrollSpy() {
  const sections = document.querySelectorAll('.analysis-section[id]');
  const links    = document.querySelectorAll('.nav-links a[href^="#"]');

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-links a[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });

  sections.forEach(s => obs.observe(s));
}

// ─────────────────────────────────────────────────────────────────
// 20. MOBILE NAV
// ─────────────────────────────────────────────────────────────────

const hamburger         = $('hamburger');
const mobileNavDrawer   = $('mobile-nav-drawer');
const mobileNavOverlay  = $('mobile-nav-overlay');

if (hamburger && mobileNavDrawer && mobileNavOverlay) {
  hamburger.addEventListener('click', () => {
    mobileNavDrawer.classList.toggle('open');
    mobileNavOverlay.classList.toggle('open');
  });
  mobileNavOverlay.addEventListener('click', () => {
    mobileNavDrawer.classList.remove('open');
    mobileNavOverlay.classList.remove('open');
  });
  mobileNavDrawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileNavDrawer.classList.remove('open');
      mobileNavOverlay.classList.remove('open');
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// 21. COLLAPSIBLES
// ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => {
    const body  = h.nextElementSibling;
    const arrow = h.querySelector('.coll-arrow');
    body.classList.toggle('open');
    if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
  });
});

// ─────────────────────────────────────────────────────────────────
// 22. INIT
// ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initScrollSpy();

  // "Explore Sample Dataset" button
  const sampleBtn = $('sample-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSample);

  // "Upload CSV" button on landing
  const uploadBtn = $('upload-landing-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      dropZone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // "Load Another Dataset" button on dashboard
  const reloadBtn = $('reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      landing.style.display   = 'flex';
      dashboard.style.display = 'none';
      topNav.style.display    = 'none';
      uploadProgress.style.display = 'none';
      hideError();
      fileInput.value = '';
      window.scrollTo({ top: 0 });
    });
  }
});



window.loadSample = loadSample;

// ─────────────────────────────────────────────────────────────────
// CORRELATION HEATMAP
// ─────────────────────────────────────────────────────────────────

function renderCorrelationSection(corrData) {
  if (!corrData) return;
  setText('corr-pos', (corrData.strongest_positive || []).join(' ↔ ') + ' (' + fmt.fixed(corrData.pos_value, 3) + ')');
  setText('corr-neg', (corrData.strongest_negative || []).join(' ↔ ') + ' (' + fmt.fixed(corrData.neg_value, 3) + ')');
  drawHeatmap('correlation-heatmap', corrData.labels, corrData.matrix);
}

function drawHeatmap(canvasId, labels, matrix) {
  const canvas = $(canvasId);
  if (!canvas || !labels || !matrix) return;
  const n = labels.length;
  const cellSize = 56;
  const padLeft = 80;
  const padTop = 40;
  canvas.width  = padLeft + n * cellSize + 20;
  canvas.height = padTop + n * cellSize + 20;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '11px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  labels.forEach((lbl, i) => {
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(lbl, padLeft - 10, padTop + i * cellSize + cellSize / 2);
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  labels.forEach((lbl, j) => {
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(lbl, padLeft + j * cellSize + cellSize / 2, padTop - 8);
  });
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = matrix[i][j];
      const x = padLeft + j * cellSize;
      const y = padTop + i * cellSize;
      ctx.fillStyle = corrColor(val);
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.fillStyle = Math.abs(val) > 0.5 ? '#07100F' : PALETTE.text;
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
    }
  }
}

function corrColor(val) {
  if (val >= 0) {
    const alpha = Math.min(1, val * 0.85 + 0.15);
    return `rgba(85, 230, 176, ${alpha})`;
  } else {
    const alpha = Math.min(1, Math.abs(val) * 0.85 + 0.15);
    return `rgba(255, 107, 138, ${alpha})`;
  }
}

// ─────────────────────────────────────────────────────────────────
// DATA EXPLORER TABLE
// ─────────────────────────────────────────────────────────────────

function renderDataTable() {
  const head = $('table-head');
  const body = $('table-body');
  if (!head || !body) return;
  head.innerHTML = TABLE_COLS.map(c => `<th onclick="sortTable('${c.key}')">${c.label} ${state.sortCol === c.key ? (state.sortDir === 'asc' ? '↑' : '↓') : ''}</th>`).join('');
  const total = state.tableFiltered.length;
  setText('table-count', total + ' records');
  setText('table-col-count', TABLE_COLS.length + ' columns');
  const start = (state.currentPage - 1) * state.rowsPerPage;
  const page  = state.tableFiltered.slice(start, start + state.rowsPerPage);
  body.innerHTML = page.map(row => `<tr>${TABLE_COLS.map(c => `<td>${formatTableCell(row[c.key], c.type)}</td>`).join('')}</tr>`).join('');
  renderPagination();
}

function formatTableCell(val, type) {
  if (val == null) return '—';
  if (type === 'date')   return fmt.date(val);
  if (type === 'num')    return fmt.num(val);
  if (type === 'vol')    return fmt.vol(val);
  if (type === 'pct')    return fmt.pct(val);
  if (type === 'change') return (val >= 0 ? '+' : '') + fmt.fixed(val, 2);
  return val;
}

window.sortTable = function(col) {
  if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sortCol = col; state.sortDir = 'asc'; }
  state.tableFiltered.sort((a, b) => {
    const av = a[col] ?? -Infinity;
    const bv = b[col] ?? -Infinity;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === 'asc' ? cmp : -cmp;
  });
  state.currentPage = 1;
  renderDataTable();
};

function renderPagination() {
  const pg = $('pagination');
  if (!pg) return;
  const totalPages = Math.ceil(state.tableFiltered.length / state.rowsPerPage) || 1;
  let html = `<button class="page-btn" onclick="gotoPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" onclick="gotoPage(${i})">${i}</button>`;
    } else if (i === 2 || i === totalPages - 1) {
      html += `<span class="page-info">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="gotoPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  pg.innerHTML = html;
}

window.gotoPage = function(p) {
  const totalPages = Math.ceil(state.tableFiltered.length / state.rowsPerPage) || 1;
  if (p < 1 || p > totalPages) return;
  state.currentPage = p;
  renderDataTable();
};
