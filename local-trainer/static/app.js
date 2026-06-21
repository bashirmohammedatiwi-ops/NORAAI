const API = '';

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res;
}

let uploadId = null;
let preview = null;
let pollTimer = null;

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const n = v <= 1 ? v * 100 : v;
  return `${n.toFixed(1)}%`;
}

function fmtNum(v, d = 3) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(d);
}

function fmtDuration(sec) {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setPhaseBadge(phase) {
  const el = document.getElementById('phase-badge');
  if (!el) return;
  const labels = {
    idle: 'Idle',
    setup: 'Setup',
    train: 'Training',
    validation: 'Validation',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
    cancelling: 'Stopping',
  };
  el.textContent = labels[phase] || phase || '—';
  el.className = 'phase-badge ' + (phase || '');
}

function showDashboard(active) {
  document.getElementById('train-dashboard').classList.toggle('hidden', !active);
  document.getElementById('train-idle-hint').classList.toggle('hidden', active);
}

function updateMetricCards(metrics = {}) {
  document.getElementById('m-map').textContent = fmtPct(metrics.map50_95);
  document.getElementById('m-map50').textContent = fmtPct(metrics.map50);
  document.getElementById('m-precision').textContent = fmtPct(metrics.precision);
  document.getElementById('m-recall').textContent = fmtPct(metrics.recall);
  document.getElementById('m-f1').textContent = fmtPct(metrics.f1);
  document.getElementById('m-loss').textContent = fmtNum(metrics.loss ?? metrics.val_loss, 4);
}

function updateTrainingUI(s) {
  const running = s.status === 'running';
  const hasHistory = (s.epoch_history?.length || 0) > 0;
  showDashboard(running || hasHistory || s.status === 'completed');

  setPhaseBadge(s.phase || s.status);
  document.getElementById('train-status').textContent = s.message || s.status || '—';
  document.getElementById('train-epoch').textContent = `${s.epoch || 0} / ${s.total_epochs || 0}`;
  document.getElementById('progress-pct').textContent = `${s.progress || 0}%`;
  document.getElementById('progress-bar').style.width = `${s.progress || 0}%`;
  document.getElementById('epoch-pct').textContent = `${s.epoch_progress || 0}%`;
  document.getElementById('epoch-bar').style.width = `${s.epoch_progress || 0}%`;
  document.getElementById('batch-info').textContent = `${s.batch || 0} / ${s.total_batches || 0}`;
  document.getElementById('batch-speed').textContent =
    s.batches_per_min ? `${s.batches_per_min} batch/min` : '—';
  document.getElementById('meta-device').textContent = s.device ? `⬡ ${s.device}` : '—';
  document.getElementById('meta-elapsed').textContent = `⏱ ${fmtDuration(s.elapsed_seconds)}`;
  document.getElementById('meta-eta').textContent =
    s.eta_seconds > 0 ? `ETA ${fmtDuration(s.eta_seconds)}` : 'ETA —';

  updateMetricCards(s.metrics || {});
  if (typeof updateCharts === 'function' && s.epoch_history?.length) {
    updateCharts(s.epoch_history);
  }

  const log = document.getElementById('train-log');
  if (log) {
    log.innerHTML = (s.log || []).slice(-40).map((e) => `<div>${e.message}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  document.getElementById('btn-train').disabled = running;
  document.getElementById('btn-cancel').disabled = !running;
}

async function loadHardware() {
  const hw = await api('/api/hardware');
  document.getElementById('hw-badge').textContent = hw.best_device_label;
}

async function loadClasses() {
  const classes = await api('/api/classes');
  const el = document.getElementById('class-list');
  el.innerHTML = classes.length
    ? classes.map((c) => `<span class="pill">${c.name}<button onclick="removeClass('${c.id}')">×</button></span>`).join('')
    : '<span style="color:#64748b">No classes yet</span>';
  return classes;
}

async function addClass() {
  const name = document.getElementById('class-name').value.trim();
  if (!name) return;
  await api('/api/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  document.getElementById('class-name').value = '';
  await loadClasses();
}

async function removeClass(id) {
  await api(`/api/classes/${id}`, { method: 'DELETE' });
  await loadClasses();
}

async function loadDatasets() {
  const data = await api('/api/datasets');
  const el = document.getElementById('dataset-info');
  if (!data.datasets?.length) {
    el.innerHTML = '<p style="color:#64748b">No dataset imported yet.</p>';
    return;
  }
  const active = data.datasets.find((d) => d.id === data.active_dataset_id) || data.datasets[0];
  el.innerHTML = `
    <div class="alert alert-ok">
      <b>${active.name || 'Dataset'}</b> · ${active.image_count} images ·
      ${active.annotations || 0} boxes · ${(active.class_names || []).length} classes
    </div>`;
  document.getElementById('train-dataset-id').value = active.id;
}

async function previewZip(file) {
  const fd = new FormData();
  fd.append('file', file);
  preview = await api('/api/dataset/preview', { method: 'POST', body: fd });
  uploadId = preview.upload_id;
  const warn = document.getElementById('preview-warn');
  if (preview.warning) {
    warn.className = 'alert alert-warn';
    warn.textContent = preview.warning;
    warn.classList.remove('hidden');
  } else if (preview.valid) {
    warn.className = 'alert alert-ok';
    warn.textContent = `${preview.labeled_count} labeled pairs · ${preview.raw_image_files} images · ${preview.raw_label_files} labels`;
    warn.classList.remove('hidden');
  } else {
    warn.className = 'alert alert-err';
    warn.textContent = 'Invalid ZIP';
    warn.classList.remove('hidden');
  }
  await buildMappingUI();
}

async function buildMappingUI() {
  const classes = await loadClasses();
  const container = document.getElementById('mapping');
  if (!preview?.detected_class_ids?.length) {
    container.innerHTML = '<p>Add classes first, then map YOLO IDs.</p>';
    return;
  }
  container.innerHTML = preview.detected_class_ids.map((yid) => {
    const suggested = preview.yolo_class_names?.[yid] || '';
    const opts = classes.map((c) =>
      `<option value="${c.name}" ${c.name === suggested ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    return `<div class="mapping-row">
      <span>ID ${yid}</span>
      <select id="map-${yid}">${opts}</select>
      <small>${suggested ? 'YOLO: ' + suggested : ''}</small>
    </div>`;
  }).join('');
}

async function importDataset() {
  if (!uploadId) return alert('Upload ZIP first');
  const mapping = {};
  preview.detected_class_ids?.forEach((yid) => {
    const sel = document.getElementById(`map-${yid}`);
    if (sel) mapping[yid] = sel.value;
  });
  const fd = new FormData();
  fd.append('upload_id', uploadId);
  fd.append('class_mapping', JSON.stringify(mapping));
  fd.append('val_split', document.getElementById('val-split').value || '0.15');
  const meta = await api('/api/dataset/import', { method: 'POST', body: fd });
  document.getElementById('import-result').className = 'alert alert-ok';
  document.getElementById('import-result').textContent = `Imported ${meta.image_count} images`;
  document.getElementById('import-result').classList.remove('hidden');
  uploadId = null;
  await loadDatasets();
}

function modelMetricTags(m) {
  const metrics = m.metrics || {};
  return `
    <div class="model-metrics">
      <span>mAP ${fmtPct(metrics.map50_95)}</span>
      <span>P ${fmtPct(metrics.precision)}</span>
      <span>R ${fmtPct(metrics.recall)}</span>
      <span>F1 ${fmtPct(metrics.f1)}</span>
    </div>`;
}

async function loadModels() {
  const models = await api('/api/models');
  const el = document.getElementById('models-list');
  if (!models.length) {
    el.innerHTML = '<p style="color:#64748b">No trained models yet.</p>';
    return;
  }
  el.innerHTML = models.map((m) => `
    <div class="model-row">
      <div>
        <b>${m.name}</b> <small>YOLO11${m.model_variant || 'n'}</small>
        ${modelMetricTags(m)}
        <small>${m.duration_seconds || 0}s · ${m.device || 'cpu'}</small>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="viewModelCharts('${m.id}')">Charts</button>
        <a class="btn btn-outline" href="/api/models/${m.id}/download?format=pt">PT</a>
        <a class="btn btn-outline" href="/api/models/${m.id}/download?format=onnx">ONNX</a>
        <button class="btn btn-outline" onclick="setFineTune('${m.id}')">Fine-tune</button>
      </div>
    </div>`).join('');
  const sel = document.getElementById('fine-tune-model');
  sel.innerHTML = '<option value="">From scratch (yolo11n/s)</option>' +
    models.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
}

async function viewModelCharts(modelId) {
  const models = await api('/api/models');
  const m = models.find((x) => x.id === modelId);
  if (!m?.epoch_history?.length) {
    alert('No epoch history for this model');
    return;
  }
  showDashboard(true);
  updateMetricCards(m.metrics);
  if (typeof updateCharts === 'function') updateCharts(m.epoch_history);
  document.getElementById('train-status').textContent = `Model: ${m.name}`;
  setPhaseBadge('completed');
}

function setFineTune(id) {
  document.getElementById('fine-tune-model').value = id;
  document.getElementById('fine-tune-hint').textContent = 'Will continue from selected model weights';
}

async function startTrain() {
  if (typeof initCharts === 'function') initCharts();
  const body = {
    dataset_id: document.getElementById('train-dataset-id').value,
    model_variant: document.getElementById('model-variant').value,
    epochs: +document.getElementById('epochs').value,
    batch_size: +document.getElementById('batch-size').value,
    image_size: +document.getElementById('image-size').value,
    learning_rate: +document.getElementById('lr').value,
    patience: +document.getElementById('patience').value,
    optimizer: document.getElementById('optimizer').value,
    augmentation: document.getElementById('augmentation').value,
    scheduler: document.getElementById('scheduler').value,
    device: document.getElementById('device').value,
    name: document.getElementById('model-name').value || undefined,
    fine_tune_model_id: document.getElementById('fine-tune-model').value || undefined,
  };
  await api('/api/train/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  showDashboard(true);
  startPolling();
}

async function cancelTrain() {
  await api('/api/train/cancel', { method: 'POST' });
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollStatus, 1000);
  pollStatus();
}

async function pollStatus() {
  const s = await api('/api/train/status');
  updateTrainingUI(s);
  if (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled') {
    clearInterval(pollTimer);
    pollTimer = null;
    await loadModels();
  }
}

document.getElementById('zip-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) previewZip(f);
});
document.getElementById('btn-add-class').addEventListener('click', addClass);
document.getElementById('btn-import').addEventListener('click', importDataset);
document.getElementById('btn-train').addEventListener('click', startTrain);
document.getElementById('btn-cancel').addEventListener('click', cancelTrain);

loadHardware();
loadClasses();
loadDatasets();
loadModels();
if (typeof initCharts === 'function') initCharts();
startPolling();
