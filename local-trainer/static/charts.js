/** Chart.js helpers for training metrics */

const CHART_COLORS = {
  loss: '#ef4444',
  map50_95: '#0f766e',
  map50: '#14b8a6',
  precision: '#3b82f6',
  recall: '#8b5cf6',
  f1: '#f59e0b',
};

let charts = {};

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
    scales: {
      x: { title: { display: true, text: 'Epoch', font: { size: 10 } }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { font: { size: 10 } } },
    },
  };
}

function initCharts() {
  if (typeof Chart === 'undefined') return;
  const ids = ['chart-loss', 'chart-map', 'chart-pr', 'chart-f1'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(el, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: chartDefaults(),
    });
  });
}

function historyFromState(s) {
  return s?.epoch_history || [];
}

function updateCharts(history) {
  if (!history?.length || typeof Chart === 'undefined') return;
  const epochs = history.map((r) => r.epoch);

  const lossData = history.map((r) => r.loss ?? r.val_loss ?? null);
  const map95 = history.map((r) => pct(r.map50_95));
  const map50 = history.map((r) => pct(r.map50));
  const prec = history.map((r) => pct(r.precision));
  const rec = history.map((r) => pct(r.recall));
  const f1 = history.map((r) => pct(r.f1));

  setChart('chart-loss', epochs, [
    { label: 'Loss', data: lossData, borderColor: CHART_COLORS.loss, tension: 0.3 },
  ], { y: { title: { display: true, text: 'Loss' } } });

  setChart('chart-map', epochs, [
    { label: 'mAP50-95 %', data: map95, borderColor: CHART_COLORS.map50_95, tension: 0.3 },
    { label: 'mAP50 %', data: map50, borderColor: CHART_COLORS.map50, tension: 0.3 },
  ], { y: { max: 100, title: { display: true, text: '%' } } });

  setChart('chart-pr', epochs, [
    { label: 'Precision %', data: prec, borderColor: CHART_COLORS.precision, tension: 0.3 },
    { label: 'Recall %', data: rec, borderColor: CHART_COLORS.recall, tension: 0.3 },
  ], { y: { max: 100 } });

  setChart('chart-f1', epochs, [
    { label: 'F1 %', data: f1, borderColor: CHART_COLORS.f1, tension: 0.3 },
  ], { y: { max: 100 } });
}

function setChart(id, labels, datasets, scaleOverrides = {}) {
  const chart = charts[id];
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets = datasets.map((d) => ({
    ...d,
    fill: false,
    pointRadius: 3,
  }));
  if (scaleOverrides.y) {
    chart.options.scales.y = { ...chart.options.scales.y, ...scaleOverrides.y };
  }
  chart.update('none');
}

function pct(v) {
  if (v == null || Number.isNaN(v)) return null;
  return v <= 1 ? v * 100 : v;
}

window.initCharts = initCharts;
window.updateCharts = updateCharts;
window.historyFromState = historyFromState;
