import type { QualityMetrics } from '@/components/training/TrainingMetricsPanel';

export interface TrainingMetricsMeta {
  source?: string;
  best_epoch?: number | null;
  simulated?: boolean;
  high_score_warning?: string;
}

const RATIO_KEYS: (keyof QualityMetrics)[] = [
  'precision',
  'recall',
  'f1',
  'map50',
  'map50_95',
];

/** User-facing metric names (no technical symbols like mAP@50-95). */
export const METRIC_DISPLAY = {
  accuracy: { label: 'Accuracy', sub: 'Overall quality' },
  detectionAccuracy: { label: 'Detection accuracy', sub: 'Moderate overlap' },
} as const;

/** YOLO metrics are 0–1; guard against accidental 0–100 storage. */
export function normalizeMetricRatio(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value > 1) return Math.min(1, value / 100);
  return value;
}

export function normalizeQualityMetrics(
  metrics: QualityMetrics | null | undefined,
): QualityMetrics | null {
  if (!metrics) return null;
  const out: QualityMetrics = { loss: metrics.loss ?? null };
  for (const key of RATIO_KEYS) {
    out[key] = normalizeMetricRatio(metrics[key]);
  }
  return out;
}

export function buildMetricsSubtitle(
  jobName: string | undefined,
  architecture: string | undefined,
  meta: TrainingMetricsMeta | null | undefined,
  message?: string | null,
): string {
  const parts: string[] = [];
  if (jobName) parts.push(jobName);
  if (architecture) parts.push(architecture);
  if (meta?.best_epoch) {
    parts.push(`Best validation · epoch ${meta.best_epoch}`);
  } else if (meta?.source === 'validation') {
    parts.push('Validation metrics');
  } else if (meta?.simulated) {
    parts.push('Simulated (CPU fallback)');
  }
  if (message && !meta?.best_epoch) parts.push(message);
  return parts.join(' · ') || 'No training job selected';
}
