/**
 * STOCKPULSE — Market Intelligence Lab
 * app_v2.js  |  Complete frontend application logic
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
// CHART.JS GLOBAL DEFAULTS
// ─────────────────────────────────────────────────────────────────

Chart.defaults.color           = '#8B9B96';
Chart.defaults.borderColor     = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family     = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size       = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.animation.duration = 600;

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const PALETTE = {
  mint:      '#55E6B0',
  cyan:      '#72D9FF',
  lime:      '#A8E87C',
  red:       '#FF6B8A',
  orange:    '#F5C842',
  bg:        '#10221F',
  border:    'rgba(255,255,255,0.06)',
  textMuted: '#8B9B96',
  text:      '#F2F7F5',
};

const TABLE_COLS = [
  { key: 'Date_str',      label: 'Date',         type: 'date'   },
  { key: 'Open',          label: 'Open',         type: 'num'    },
  { key: 'High',          label: 'High',         type: 'num'    },
  { key: 'Low',           label: 'Low',          type: 'num'    },
  { key: 'Close',         label: 'Close',        type: 'num'    },
  { key: 'Volume',        label: 'Volume',       type: 'vol'    },
  { key: 'Daily_Return',  label: 'Daily Return', type: 'pct'    },
  { key: 'Price_Change',  label: 'Price Change', type: 'change' },
  { key: 'MA_20',         label: '20D MA',       type: 'num'    },
  { key: 'MA_50',         label: '50D MA',       type: 'num'    },
  { key: 'Volatility_20', label: 'Volatility',   type: 'pct'    },
];

// ─────────────────────────────────────────────────────────────────
// APPLICATION STATE
// ─────────────────────────────────────────────────────────────────

const state = {
  analysisData:  null,
  charts:        {},
  tableData:     [],
  tableFiltered: [],
  sortCol:       'Date_str',
  sortDir:       'desc',
  currentPage:   1,
  rowsPerPage:   15,
  priceField:    'close',
  priceMA:       { ma20: false, ma50: false },
  priceRange:    'ALL',
};

// ─────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = (val !== null && val !== undefined) ? String(val) : '—';
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function showNoData(canvasId, message) {
  const canvas = $(canvasId);
  if (!canvas) return;
  canvas.style.display = 'none';
  const parent = canvas.parentElement;
  if (!parent) return;
  let msg = parent.querySelector('.no-data-msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'no-data-msg';
    msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:160px;color:#8B9B96;font-size:0.85rem;';
    parent.appendChild(msg);
  }
  msg.textContent = message || 'No data available';
}

function showCanvas(canvasId) {
  const canvas = $(canvasId);
  if (!canvas) return;
  canvas.style.display = '';
  const parent = canvas.parentElement;
  if (parent) {
    const msg = parent.querySelector('.no-data-msg');
    if (msg) msg.remove();
  }
}

// ─────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────

const fmt = {
  num:   v => v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
  pct:   v => v == null ? '—' : (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(2) + '%',
  price: v => v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  vol:   v => {
    if (v == null) return '—';
    v = Number(v);
    if (v >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
    if (v >= 1e5) return (v / 1e5).toFixed(2) + ' L';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toLocaleString('en-IN');
  },
  fixed: (v, d) => v == null ? '—' : Number(v).toFixed(d != null ? d : 2),
  date:  s => s || '—',
};

// ─────────────────────────────────────────────────────────────────
// CHART OPTIONS FACTORY
// ─────────────────────────────────────────────────────────────────

function chartOptions(yLabel, xLabel, showLegend) {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    interaction:         { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display:  !!showLegend,
        position: 'top',
        align:    'end',
        labels:   { color: PALETTE.textMuted, boxWidth: 10, usePointStyle: true, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(13,25,23,0.95)',
        borderColor:     PALETTE.border,
        borderWidth:     1,
        titleColor:      PALETTE.text,
        bodyColor:       PALETTE.textMuted,
        padding:         12,
        cornerRadius:    6,
      },
    },
    scales: {
      x: {
        grid:   { color: 'rgba(255,255,255,0.04)' },
        ticks:  { color: PALETTE.textMuted, maxTicksLimit: 10, maxRotation: 0 },
        border: { color: PALETTE.border },
        title:  xLabel ? { display: true, text: xLabel, color: PALETTE.textMuted } : undefined,
      },
      y: {
        grid:   { color: 'rgba(255,255,255,0.04)' },
        ticks:  { color: PALETTE.textMuted },
        border: { color: PALETTE.border },
        title:  yLabel ? { display: true, text: yLabel, color: PALETTE.textMuted } : undefined,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// UI STATE HELPERS
// ─────────────────────────────────────────────────────────────────

function showProgress() {
  const prog = $('upload-progress');
  const err  = $('error-panel');
  if (prog) prog.style.display = 'block';
  if (err)  err.style.display  = 'none';
}

function hideProgress() {
  const prog = $('upload-progress');
  if (prog) prog.style.display = 'none';
}

function setStep(n) {
  const ids = ['step-upload', 'step-validate', 'step-calculate', 'step-render'];
  ids.forEach((id, i) => {
    const el = $(id);
    if (!el) return;
    if      (i + 1 < n)  el.className = 'progress-step done';
    else if (i + 1 === n) el.className = 'progress-step active';
    else                  el.className = 'progress-step';
  });
}

function showError(errors) {
  const panel = $('error-panel');
  const list  = $('error-list');
  if (!panel || !list) return;
  list.innerHTML   = (errors || ['Unknown error.']).map(e => `<li>${e}</li>`).join('');
  panel.style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────
// API — LOAD SAMPLE
// ─────────────────────────────────────────────────────────────────

async function loadSample() {
  showProgress();
  setStep(1);
  try {
    setStep(2);
    setStep(3);
    const res  = await fetch('/sample');
    const data = await res.json();
    setStep(4);
    if (data.success) {
      setTimeout(() => renderDashboard(data), 300);
    } else {
      showError(data.errors || ['Failed to load sample data.']);
    }
  } catch (err) {
    showError(['Network error. Is the server running?']);
  } finally {
    hideProgress();
  }
}
window.loadSample = loadSample; // Expose globally for onclick

// ─────────────────────────────────────────────────────────────────
// API — UPLOAD CSV
// ─────────────────────────────────────────────────────────────────

async function processFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    showError(['Please upload a .csv file.']);
    return;
  }
  showProgress();
  setStep(1);
  const fd = new FormData();
  fd.append('file', file);
  try {
    setStep(2);
    setStep(3);
    const res  = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setStep(4);
    if (data.success) {
      setTimeout(() => renderDashboard(data), 300);
    } else {
      showError(data.errors || ['Validation failed.']);
    }
  } catch (err) {
    showError(['Server error during upload.']);
  } finally {
    hideProgress();
  }
}

// ─────────────────────────────────────────────────────────────────
// MASTER RENDER
// ─────────────────────────────────────────────────────────────────

function renderDashboard(data) {
  state.analysisData  = data;
  state.tableData     = data.table || [];
  state.tableFiltered = [...state.tableData];

  const landingEl = $('landing');
  const dashEl    = $('dashboard');
  const navEl     = $('top-nav');

  if (landingEl) landingEl.style.display = 'none';
  if (dashEl)    dashEl.style.display    = 'block';
  if (navEl)     navEl.style.display     = 'block';

  document.querySelectorAll('.scroll-reveal').forEach(el => el.classList.add('visible'));

  const charts = data.charts || {};

  renderFormatInfo(data.format_info);
  renderQualityPanel(data.quality_report);
  renderOverview(data.overview, data.trend, charts.price);
  renderPriceSection(charts.price, data.trend);
  renderReturnSection(charts.returns, charts.histogram, data.return_stats);
  renderVolatilitySection(charts.volatility, data.vol_stats);
  renderVolumeSection(charts.volume, data.volume_stats);
  renderDataTable();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────
// FORMAT INFO & QUALITY PANEL
// ─────────────────────────────────────────────────────────────────

function renderFormatInfo(fi) {
  const panel = $('normalization-panel');
  if (!panel) return;
  if (fi && fi.source_format !== 'Standard Format') {
    panel.style.display = 'block';
    setText('fmt-source',     fi.source_format);
    setText('fmt-detected',   (fi.detected_columns  || []).join(', '));
    setText('fmt-normalized', (fi.normalized_columns || []).join(', '));
    const mc = $('fmt-mappings-container');
    if (mc && Object.keys(fi.mappings || {}).length > 0) {
      mc.style.display = 'block';
      setText('fmt-mappings', Object.entries(fi.mappings).map(([k, v]) => k + ' -> ' + v).join(', '));
    } else if (mc) {
      mc.style.display = 'none';
    }
  } else {
    panel.style.display = 'none';
  }
}

function renderQualityPanel(r) {
  if (!r) return;
  setText('q-rows',       r.original_rows    != null ? r.original_rows    : 0);
  setText('q-cols',       r.original_cols    != null ? r.original_cols    : 0);
  setText('q-missing',    r.missing_values   != null ? r.missing_values   : 0);
  setText('q-dupes',      r.duplicate_rows   != null ? r.duplicate_rows   : 0);
  setText('q-invalid',    r.invalid_values   != null ? r.invalid_values   : 0);
  setText('q-clean-rows', r.rows_after_clean != null ? r.rows_after_clean : 0);
}

// ─────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────

function renderOverview(overview, trend, priceChart) {
  if (!overview) return;
  setText('ov-dataset-name', overview.dataset_name);
  setText('ov-date-start',   fmt.date(overview.date_start));
  setText('ov-date-end',     fmt.date(overview.date_end));
  setText('ov-rows',         overview.total_rows);
  setText('ov-last-close',   fmt.price(overview.last_close));
  setText('ov-high',         fmt.price(overview.all_time_high));
  setText('ov-low',          fmt.price(overview.all_time_low));
  setText('ov-avg-return',   fmt.pct(overview.avg_return));
  setText('ov-volatility',   fmt.fixed(overview.current_vol, 2) + '%');
  setText('ov-volume',       fmt.vol(overview.total_volume));

  const badge = $('ov-trend');
  if (badge && trend) {
    badge.textContent = trend.direction;
    badge.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
  }

  if (priceChart && priceChart.close) {
    drawSparkline('sparkline-close', priceChart.close, PALETTE.mint);
  }
}

function drawSparkline(canvasId, data, color) {
  const canvas = $(canvasId);
  if (!canvas || !data || data.length < 2) return;
  const ctx   = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const valid = data.filter(v => v != null);
  if (!valid.length) return;
  const mn    = Math.min(...valid);
  const mx    = Math.max(...valid);
  const range = (mx - mn) || 1;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  data.forEach((v, i) => {
    if (v == null) return;
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - mn) / range) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}



// ─────────────────────────────────────────────────────────────────
// SECTION 01 — PRICE BEHAVIOR
// ─────────────────────────────────────────────────────────────────

function renderPriceSection(chartData, trend) {
  if (trend) {
    setText('price-trend-strength', fmt.fixed(trend.strength, 1) + '%');
    setText('price-change-pct',     fmt.pct(trend.total_change_pct));
    setText('price-high',           fmt.price(trend.highest_price) + ' (' + fmt.date(trend.highest_date) + ')');
    setText('price-low',            fmt.price(trend.lowest_price)  + ' (' + fmt.date(trend.lowest_date)  + ')');
    const badge = $('price-trend-badge');
    if (badge) {
      badge.textContent = trend.direction;
      badge.className   = 'status-badge status-' + (trend.direction || '').toLowerCase();
    }
  }
  buildPriceChart(chartData, state.priceRange);
}

function buildPriceChart(chartData, rangeKey) {
  const canvas = $('price-chart');
  if (!canvas) return;
  if (!chartData || !chartData.dates || !chartData.dates.length) {
    showNoData('price-chart', 'No price data available');
    return;
  }
  showCanvas('price-chart');
  destroyChart('price');

  const field = state.priceField || 'close';
  let dates = chartData.dates.slice();
  let close = (chartData[field] || chartData.close || []).slice();
  let ma20  = chartData.ma20 ? chartData.ma20.slice() : null;
  let ma50  = chartData.ma50 ? chartData.ma50.slice() : null;

  const limits = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252 };
  const limit  = limits[rangeKey];
  if (limit && limit < dates.length) {
    dates = dates.slice(-limit);
    close = close.slice(-limit);
    if (ma20) ma20 = ma20.slice(-limit);
    if (ma50) ma50 = ma50.slice(-limit);
  }

  const datasets = [{
    label:           field.toUpperCase(),
    data:            close,
    borderColor:     PALETTE.mint,
    backgroundColor: 'transparent',
    borderWidth:     2,
    pointRadius:     0,
    tension:         0.2,
  }];
  if (state.priceMA.ma20 && ma20) {
    datasets.push({ label: '20D MA', data: ma20, borderColor: '#B07AFF', borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4] });
  }
  if (state.priceMA.ma50 && ma50) {
    datasets.push({ label: '50D MA', data: ma50, borderColor: PALETTE.orange, borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4] });
  }

  const ctx = canvas.getContext('2d');
  state.charts.price = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets: datasets },
    options: chartOptions('Price', '', datasets.length > 1),
  });
}

// ─────────────────────────────────────────────────────────────────
// SECTION 02 — RETURN DISTRIBUTION
// ─────────────────────────────────────────────────────────────────

function renderReturnSection(returnsChartData, histData, returnStats) {
  if (returnStats) {
    setText('ret-avg',      fmt.pct(returnStats.average));
    setText('ret-std',      fmt.fixed(returnStats.std, 4) + '%');
    setText('ret-pos-pct',  returnStats.pct_positive != null ? returnStats.pct_positive + '%' : '—');
    setText('ret-neg-pct',  returnStats.pct_negative != null ? returnStats.pct_negative + '%' : '—');
    setText('ret-within2',  returnStats.within_2pct  != null ? returnStats.within_2pct  + '%' : '—');
    setText('ret-max-gain', fmt.pct(returnStats.max_gain) + ' (' + fmt.date(returnStats.max_gain_date) + ')');
    setText('ret-max-loss', fmt.pct(returnStats.max_loss) + ' (' + fmt.date(returnStats.max_loss_date) + ')');
  }

  // Daily Returns bar chart
  const lineCanvas = $('returns-chart');
  if (lineCanvas) {
    const hasData = returnsChartData && returnsChartData.returns && returnsChartData.returns.some(v => v != null);
    if (!hasData) {
      showNoData('returns-chart', 'No daily return data available');
    } else {
      showCanvas('returns-chart');
      destroyChart('returns');
      const ctx    = lineCanvas.getContext('2d');
      const colors = returnsChartData.returns.map(v => (v == null || v >= 0) ? PALETTE.mint + 'CC' : PALETTE.red + 'CC');
      state.charts.returns = new Chart(ctx, {
        type: 'bar',
        data: {
          labels:   returnsChartData.dates,
          datasets: [{
            label:           'Daily Return (%)',
            data:            returnsChartData.returns,
            backgroundColor: colors,
            borderWidth:     0,
            borderRadius:    1,
          }],
        },
        options: chartOptions('Return (%)', '', false),
      });
    }
  }

  // Histogram
  const histCanvas = $('histogram-chart');
  if (histCanvas) {
    const hasData = histData && histData.counts && histData.counts.length > 0;
    if (!hasData) {
      showNoData('histogram-chart', 'No histogram data available');
    } else {
      showCanvas('histogram-chart');
      destroyChart('histogram');
      const ctx = histCanvas.getContext('2d');
      state.charts.histogram = new Chart(ctx, {
        type: 'bar',
        data: {
          labels:   histData.bin_centers.map(v => fmt.fixed(v, 2) + '%'),
          datasets: [{
            label:           'Frequency',
            data:            histData.counts,
            backgroundColor: PALETTE.cyan + '88',
            borderColor:     PALETTE.cyan,
            borderWidth:     1,
            borderRadius:    2,
          }],
        },
        options: chartOptions('Frequency', 'Return (%)', false),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SECTION 03 — VOLATILITY LAB
// ─────────────────────────────────────────────────────────────────

function renderVolatilitySection(chartData, volStats) {
  if (volStats) {
    setText('vol-current',    fmt.fixed(volStats.current,    2) + '%');
    setText('vol-average',    fmt.fixed(volStats.average,    2) + '%');
    setText('vol-maximum',    fmt.fixed(volStats.maximum,    2) + '%');
    setText('vol-minimum',    fmt.fixed(volStats.minimum,    2) + '%');
    setText('vol-annualised', fmt.fixed(volStats.annualised, 2) + '%');
    const badge = $('vol-status-badge');
    if (badge) {
      badge.textContent = volStats.status;
      badge.className   = 'status-badge status-' + (volStats.status || '').toLowerCase();
    }
    const list = $('high-vol-dates');
    if (list && volStats.high_vol_dates) {
      list.innerHTML = volStats.high_vol_dates.map(d =>
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border);font-size:0.8rem;">' +
        '<span>' + fmt.date(d.Date_str) + '</span>' +
        '<span class="text-neg">' + fmt.fixed(d.volatility, 2) + '%</span>' +
        '</div>'
      ).join('');
    }
  }

  const canvas = $('volatility-chart');
  if (canvas) {
    const hasData = chartData && chartData.volatility && chartData.volatility.some(v => v != null);
    if (!hasData) {
      showNoData('volatility-chart', 'Insufficient data for volatility (needs 20+ rows)');
    } else {
      showCanvas('volatility-chart');
      destroyChart('volatility');
      const ctx     = canvas.getContext('2d');
      const avg     = volStats ? volStats.average : null;
      const avgLine = chartData.volatility.map(() => avg);
      state.charts.volatility = new Chart(ctx, {
        type: 'line',
        data: {
          labels:   chartData.dates,
          datasets: [
            {
              label:           '20D Rolling Volatility (%)',
              data:            chartData.volatility,
              borderColor:     PALETTE.orange,
              backgroundColor: PALETTE.orange + '18',
              fill:            true,
              tension:         0.3,
              pointRadius:     0,
              borderWidth:     2,
            },
            {
              label:       'Average Volatility',
              data:        avgLine,
              borderColor: PALETTE.cyan + '88',
              borderDash:  [5, 3],
              fill:        false,
              pointRadius: 0,
              borderWidth: 1.5,
            },
          ],
        },
        options: chartOptions('Volatility (%)', '', true),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SECTION 04 — MARKET ACTIVITY (VOLUME)
// ─────────────────────────────────────────────────────────────────

function renderVolumeSection(chartData, volumeStats) {
  if (volumeStats) {
    setText('vol-avg',     fmt.vol(volumeStats.average));
    setText('vol-highest', fmt.vol(volumeStats.highest_volume) + ' (' + fmt.date(volumeStats.highest_date) + ')');
    setText('vol-lowest',  fmt.vol(volumeStats.lowest_volume)  + ' (' + fmt.date(volumeStats.lowest_date)  + ')');
  }

  // Volume bar chart
  const canvas = $('volume-chart');
  if (canvas) {
    const hasData = chartData && chartData.volume && chartData.volume.some(v => v != null);
    if (!hasData) {
      showNoData('volume-chart', 'No volume data available');
    } else {
      showCanvas('volume-chart');
      destroyChart('volume');
      const ctx     = canvas.getContext('2d');
      const avg     = volumeStats ? volumeStats.average : null;
      const avgLine = chartData.volume.map(() => avg);
      state.charts.volume = new Chart(ctx, {
        type: 'bar',
        data: {
          labels:   chartData.dates,
          datasets: [
            {
              label:           'Volume',
              data:            chartData.volume,
              backgroundColor: PALETTE.mint + '66',
              borderRadius:    1,
              order:           2,
            },
            {
              label:       'Avg Volume',
              data:        avgLine,
              type:        'line',
              borderColor: PALETTE.orange + 'AA',
              borderDash:  [5, 3],
              fill:        false,
              pointRadius: 0,
              borderWidth: 1.5,
              order:       1,
            },
          ],
        },
        options: chartOptions('Volume', '', true),
      });
    }
  }

  // Price vs Volume scatter
  const pvCanvas = $('price-vol-chart');
  if (pvCanvas) {
    const hasData = chartData && chartData.volume && chartData.close && chartData.volume.some(v => v != null);
    if (!hasData) {
      showNoData('price-vol-chart', 'No price vs volume data available');
    } else {
      showCanvas('price-vol-chart');
      destroyChart('priceVol');
      const ctx         = pvCanvas.getContext('2d');
      const scatterData = chartData.volume
        .map((v, i) => ({ x: v, y: chartData.close[i] }))
        .filter(d => d.x != null && d.y != null);
      state.charts.priceVol = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label:           'Volume vs Price',
            data:            scatterData,
            backgroundColor: PALETTE.mint + 'AA',
            borderColor:     PALETTE.mint,
            borderWidth:     1,
            pointRadius:     3,
            pointHoverRadius: 5,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(13,25,23,0.95)',
              borderColor:     PALETTE.border,
              borderWidth:     1,
              titleColor:      PALETTE.text,
              bodyColor:       PALETTE.textMuted,
              padding:         10,
              callbacks: {
                label: function(ctx) {
                  return 'Vol: ' + fmt.vol(ctx.raw.x) + '  Price: ' + fmt.price(ctx.raw.y);
                },
              },
            },
          },
          scales: {
            x: {
              title:  { display: true, text: 'Volume', color: PALETTE.textMuted },
              grid:   { color: 'rgba(255,255,255,0.04)' },
              ticks:  { color: PALETTE.textMuted, callback: function(v) { return fmt.vol(v); } },
              border: { color: PALETTE.border },
            },
            y: {
              title:  { display: true, text: 'Price', color: PALETTE.textMuted },
              grid:   { color: 'rgba(255,255,255,0.04)' },
              ticks:  { color: PALETTE.textMuted },
              border: { color: PALETTE.border },
            },
          },
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SECTION 05 — CORRELATION HEATMAP
// ─────────────────────────────────────────────────────────────────

function renderCorrelationSection(corrData) {
  if (!corrData) {
    setText('corr-pos', '—');
    setText('corr-neg', '—');
    return;
  }
  const posLabel = (corrData.strongest_positive || []).join(' <-> ');
  const negLabel = (corrData.strongest_negative || []).join(' <-> ');
  setText('corr-pos', posLabel + (corrData.pos_value != null ? ' (' + fmt.fixed(corrData.pos_value, 3) + ')' : ''));
  setText('corr-neg', negLabel + (corrData.neg_value != null ? ' (' + fmt.fixed(corrData.neg_value, 3) + ')' : ''));
  drawHeatmap('correlation-heatmap', corrData.labels, corrData.matrix);
}

function drawHeatmap(canvasId, labels, matrix) {
  const canvas = $(canvasId);
  if (!canvas || !labels || !matrix || !labels.length) {
    showNoData(canvasId, 'No correlation data available');
    return;
  }
  showCanvas(canvasId);
  const n        = labels.length;
  const cellSize = 56;
  const padLeft  = 90;
  const padTop   = 44;
  canvas.width   = padLeft + n * cellSize + 16;
  canvas.height  = padTop  + n * cellSize + 16;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font         = '11px JetBrains Mono, monospace';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = PALETTE.textMuted;
  labels.forEach(function(lbl, i) {
    ctx.fillText(lbl, padLeft - 8, padTop + i * cellSize + cellSize / 2);
  });
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  labels.forEach(function(lbl, j) {
    ctx.fillText(lbl, padLeft + j * cellSize + cellSize / 2, padTop - 6);
  });
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      var val = matrix[i][j];
      var x   = padLeft + j * cellSize;
      var y   = padTop  + i * cellSize;
      ctx.fillStyle = corrColor(val);
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.fillStyle    = Math.abs(val) > 0.5 ? '#07100F' : PALETTE.text;
      ctx.font         = '10px JetBrains Mono, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
    }
  }
}

function corrColor(val) {
  if (val >= 0) {
    var a = Math.min(1, val * 0.85 + 0.15);
    return 'rgba(85, 230, 176, ' + a + ')';
  }
  var a = Math.min(1, Math.abs(val) * 0.85 + 0.15);
  return 'rgba(255, 107, 138, ' + a + ')';
}

// ─────────────────────────────────────────────────────────────────
// SECTION 06 — DATA EXPLORER
// ─────────────────────────────────────────────────────────────────

function renderDataTable() {
  var head = $('table-head');
  var body = $('table-body');
  if (!head || !body) return;
  head.innerHTML = TABLE_COLS.map(function(c) {
    var arrow = state.sortCol === c.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<th onclick="sortTable(\'' + c.key + '\')" style="cursor:pointer;">' + c.label + arrow + '</th>';
  }).join('');
  setText('table-count',     state.tableFiltered.length + ' records');
  setText('table-col-count', TABLE_COLS.length + ' columns');
  var start = (state.currentPage - 1) * state.rowsPerPage;
  var page  = state.tableFiltered.slice(start, start + state.rowsPerPage);
  body.innerHTML = page.map(function(row) {
    return '<tr>' + TABLE_COLS.map(function(c) {
      return '<td>' + formatTableCell(row[c.key], c.type) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  renderPagination();
}

function formatTableCell(val, type) {
  if (val == null) return '—';
  if (type === 'date')   return fmt.date(val);
  if (type === 'num')    return fmt.num(val);
  if (type === 'vol')    return fmt.vol(val);
  if (type === 'pct')    return fmt.pct(val);
  if (type === 'change') return (Number(val) >= 0 ? '+' : '') + fmt.fixed(val, 2);
  return val;
}

window.sortTable = function(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'asc';
  }
  state.tableFiltered.sort(function(a, b) {
    var av = a[col] != null ? a[col] : -Infinity;
    var bv = b[col] != null ? b[col] : -Infinity;
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === 'asc' ? cmp : -cmp;
  });
  state.currentPage = 1;
  renderDataTable();
};

function renderPagination() {
  var pg = $('pagination');
  if (!pg) return;
  var total = Math.ceil(state.tableFiltered.length / state.rowsPerPage) || 1;
  var html  = '<button class="page-btn" onclick="gotoPage(' + (state.currentPage - 1) + ')" ' + (state.currentPage === 1 ? 'disabled' : '') + '>‹</button>';
  for (var i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      html += '<button class="page-btn' + (i === state.currentPage ? ' active' : '') + '" onclick="gotoPage(' + i + ')">' + i + '</button>';
    } else if (i === 2 || i === total - 1) {
      html += '<span style="padding:0 4px;color:#8B9B96;">…</span>';
    }
  }
  html += '<button class="page-btn" onclick="gotoPage(' + (state.currentPage + 1) + ')" ' + (state.currentPage === total ? 'disabled' : '') + '>›</button>';
  pg.innerHTML = html;
}

window.gotoPage = function(p) {
  var total = Math.ceil(state.tableFiltered.length / state.rowsPerPage) || 1;
  if (p < 1 || p > total) return;
  state.currentPage = p;
  renderDataTable();
};

// ─────────────────────────────────────────────────────────────────
// PRICE CHART CONTROLS
// ─────────────────────────────────────────────────────────────────

function initChartControls() {
  document.querySelectorAll('[data-price-field]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      document.querySelectorAll('[data-price-field]').forEach(function(b) { b.classList.remove('active'); });
      e.currentTarget.classList.add('active');
      state.priceField = e.currentTarget.dataset.priceField;
      if (state.analysisData) buildPriceChart(state.analysisData.charts.price, state.priceRange);
    });
  });
  document.querySelectorAll('[data-ma]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.currentTarget.classList.toggle('active');
      var key = e.currentTarget.dataset.ma;
      state.priceMA[key] = e.currentTarget.classList.contains('active');
      if (state.analysisData) buildPriceChart(state.analysisData.charts.price, state.priceRange);
    });
  });
  document.querySelectorAll('[data-range]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      document.querySelectorAll('[data-range]').forEach(function(b) { b.classList.remove('active'); });
      e.currentTarget.classList.add('active');
      state.priceRange = e.currentTarget.dataset.range;
      if (state.analysisData) buildPriceChart(state.analysisData.charts.price, state.priceRange);
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// SCROLL REVEAL
// ─────────────────────────────────────────────────────────────────

function initScrollReveal() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.scroll-reveal').forEach(function(el) { obs.observe(el); });
}

// ─────────────────────────────────────────────────────────────────
// NAV SCROLL SPY
// ─────────────────────────────────────────────────────────────────

function initScrollSpy() {
  var sections = document.querySelectorAll('.analysis-section[id]');
  var links    = document.querySelectorAll('.nav-links a[href^="#"]');
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        links.forEach(function(l) { l.classList.remove('active'); });
        var a = document.querySelector('.nav-links a[href="#' + e.target.id + '"]');
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });
  sections.forEach(function(s) { obs.observe(s); });
}

// ─────────────────────────────────────────────────────────────────
// MOBILE NAV
// ─────────────────────────────────────────────────────────────────

function initMobileNav() {
  var hamburger     = $('hamburger');
  var mobileDrawer  = $('mobile-nav-drawer');
  var mobileOverlay = $('mobile-nav-overlay');
  if (!hamburger || !mobileDrawer) return;
  hamburger.addEventListener('click', function() {
    mobileDrawer.classList.toggle('open');
    if (mobileOverlay) mobileOverlay.classList.toggle('open');
  });
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', function() {
      mobileDrawer.classList.remove('open');
      mobileOverlay.classList.remove('open');
    });
  }
  mobileDrawer.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      mobileDrawer.classList.remove('open');
      if (mobileOverlay) mobileOverlay.classList.remove('open');
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// COLLAPSIBLES
// ─────────────────────────────────────────────────────────────────

function initCollapsibles() {
  document.querySelectorAll('.collapsible-header').forEach(function(h) {
    h.addEventListener('click', function() {
      var body  = h.nextElementSibling;
      var arrow = h.querySelector('.coll-arrow');
      if (body)  body.classList.toggle('open');
      if (arrow) arrow.textContent = (body && body.classList.contains('open')) ? '▲' : '▼';
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// UPLOAD & DROP ZONE
// ─────────────────────────────────────────────────────────────────

function initUpload() {
  var dropZone  = $('drop-zone');
  var fileInput = $('file-input');

  if (dropZone) {
    dropZone.addEventListener('click', function() { if (fileInput) fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      if (fileInput.files.length) processFile(fileInput.files[0]);
    });
  }

  var uploadBtn = $('upload-landing-btn');
  if (uploadBtn) uploadBtn.addEventListener('click', function() { if (fileInput) fileInput.click(); });

  var reloadBtn = $('reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function() {
      var landing   = $('landing');
      var dashboard = $('dashboard');
      var topNav    = $('top-nav');
      if (landing)   landing.style.display   = 'flex';
      if (dashboard) dashboard.style.display = 'none';
      if (topNav)    topNav.style.display    = 'none';
      if (fileInput) fileInput.value = '';
      window.scrollTo({ top: 0 });
    });
  }

  var sampleBtn = $('sample-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSample);

  var dlBtn = $('download-btn');
  if (dlBtn) dlBtn.addEventListener('click', function() { window.location.href = '/download'; });

  var searchInput = $('table-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase().trim();
      state.tableFiltered = q
        ? state.tableData.filter(function(row) {
            return Object.values(row).some(function(v) { return String(v != null ? v : '').toLowerCase().includes(q); });
          })
        : state.tableData.slice();
      state.currentPage = 1;
      renderDataTable();
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initScrollSpy();
  initScrollReveal();
  initMobileNav();
  initCollapsibles();
  initUpload();
  initChartControls();
});
