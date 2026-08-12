export interface LabDetection {
  id: string;
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface LabPredictParams {
  conf: number;
  iou: number;
  imgsz: number;
}

export interface LabPredictResult {
  latency_ms: number;
  inference_ms?: number | null;
  params: LabPredictParams;
  filename: string;
  content_type: string;
  size_bytes: number;
  count: number;
  detections: LabDetection[];
  annotated_image?: string | null;
  raw: unknown;
}

export interface LabBatchResult {
  results: LabPredictResult[];
  count: number;
  total_latency_ms: number;
  params: LabPredictParams;
}

export interface LabConfig {
  configured: boolean;
  endpoint: string | null;
  endpoint_label?: string;
  api_key_required?: boolean;
  api_key_configured?: boolean;
  defaults: LabPredictParams;
  fast_defaults?: LabPredictParams;
  supports_video: boolean;
  max_upload_mb: number;
  batch_concurrency?: number;
}

export const UL_API_KEY_STORAGE = 'rasid_ul_api_key';

export function getUlApiKey(): string {
  try {
    return localStorage.getItem(UL_API_KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveUlApiKey(key: string) {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(UL_API_KEY_STORAGE, trimmed);
  else localStorage.removeItem(UL_API_KEY_STORAGE);
}

export interface LabHistoryEntry {
  id: string;
  at: string;
  filename: string;
  mode: 'image' | 'video';
  count: number;
  latency_ms: number;
  top_class?: string;
}

export interface VideoFrameJob {
  time: number;
  blob: Blob;
}

const CLASS_PALETTE = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488',
  '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#64748b',
];

export function classColor(className: string): string {
  let hash = 0;
  for (let i = 0; i < className.length; i += 1) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLASS_PALETTE[Math.abs(hash) % CLASS_PALETTE.length];
}

/** Convert bbox to pixel xyxy — supports normalized or absolute coords. */
export function bboxToPixels(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [a, b, c, d] = bbox;
  const normalized = [a, b, c, d].every((v) => v >= 0 && v <= 1);
  if (normalized) {
    return [a * width, b * height, c * width, d * height];
  }
  // xywh format heuristic: if c,d smaller than a,b and c < width
  if (c <= width && d <= height && c < a + width * 0.9 && d < b + height * 0.9 && c > 0 && d > 0 && a + c <= width * 1.05 && b + d <= height * 1.05) {
    if (a + c > width || b + d > height) {
      // likely xyxy
      return [a, b, c, d];
    }
    return [a, b, a + c, b + d];
  }
  return [a, b, c, d];
}

export function filterDetections(detections: LabDetection[], minConf: number): LabDetection[] {
  return detections.filter((d) => d.confidence >= minConf);
}

export async function optimizeImageFile(file: File, maxLongEdge: number, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
      el.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const longEdge = Math.max(w, h);
    if (longEdge <= maxLongEdge && file.size < 250_000) return file;

    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, tw, th);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل ضغط الصورة'))), 'image/jpeg', quality);
    });
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
    img.src = src;
  });
}

export async function extractVideoFrames(
  file: File,
  fps: number,
  maxFrames: number,
  onProgress?: (done: number, total: number) => void,
  maxLongEdge = 640,
): Promise<VideoFrameJob[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('تعذّر قراءة الفيديو'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('مدة الفيديو غير صالحة');
    }

    const interval = 1 / Math.max(0.5, fps);
    const times: number[] = [];
    for (let t = 0; t < duration && times.length < maxFrames; t += interval) {
      times.push(t);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas غير مدعوم');

    const frames: VideoFrameJob[] = [];
    let canvasW = 0;
    let canvasH = 0;
    for (let i = 0; i < times.length; i += 1) {
      const time = times[i];
      await seekVideo(video, time);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const longEdge = Math.max(vw, vh);
      const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
      canvasW = Math.max(1, Math.round(vw * scale));
      canvasH = Math.max(1, Math.round(vh * scale));
      canvas.width = canvasW;
      canvas.height = canvasH;
      ctx.drawImage(video, 0, 0, canvasW, canvasH);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل استخراج الإطار'))), 'image/jpeg', 0.78);
      });
      frames.push({ time, blob });
      onProgress?.(i + 1, times.length);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}

export function drawDetectionsOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | HTMLVideoElement,
  detections: LabDetection[],
  selectedId: string | null,
  minConf: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = 'videoWidth' in image ? image.videoWidth : image.naturalWidth;
  const h = 'videoHeight' in image ? image.videoHeight : image.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(image, 0, 0, w, h);

  for (const det of filterDetections(detections, minConf)) {
    const [x1, y1, x2, y2] = bboxToPixels(det.bbox, w, h);
    const color = classColor(det.class);
    const selected = det.id === selectedId;
    const bw = x2 - x1;
    const bh = y2 - y1;

    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeRect(x1, y1, bw, bh);

    const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 13px IBM Plex Sans Arabic, sans-serif';
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = color;
    ctx.fillRect(x1, Math.max(0, y1 - 22), tw, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x1 + 6, Math.max(14, y1 - 6));

    if (selected) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.strokeRect(x1, y1, bw, bh);
      ctx.shadowBlur = 0;
    }
  }
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/jpeg', 0.92);
  link.click();
}

export function loadLabHistory(): LabHistoryEntry[] {
  try {
    const raw = localStorage.getItem('rasid_lab_history');
    return raw ? (JSON.parse(raw) as LabHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function pushLabHistory(entry: LabHistoryEntry) {
  const prev = loadLabHistory().filter((e) => e.id !== entry.id);
  const next = [entry, ...prev].slice(0, 12);
  localStorage.setItem('rasid_lab_history', JSON.stringify(next));
}
