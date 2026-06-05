export type CpuPreset =
  | 'best_accuracy'
  | 'max_cpu'
  | 'fleet_cpu'
  | 'turbo_cpu'
  | 'fast_cpu'
  | 'balanced';

export const CPU_PRESETS: Record<CpuPreset, { label: string; description: string; epochs: number }> = {
  best_accuracy: {
    label: 'Best Accuracy',
    description: '20 epochs · 640px · medium aug — highest mAP (recommended)',
    epochs: 20,
  },
  max_cpu: {
    label: 'Max CPU',
    description: '12 epochs · 416px — fastest full training run',
    epochs: 12,
  },
  fleet_cpu: {
    label: 'Fleet Camera',
    description: '12 epochs · 416px — tuned for live road detection',
    epochs: 12,
  },
  turbo_cpu: {
    label: 'Turbo CPU',
    description: '5 epochs · 320px · minimal aug — quick test only',
    epochs: 5,
  },
  fast_cpu: {
    label: 'Fast CPU',
    description: '8 epochs · 416px · light aug — faster iteration',
    epochs: 8,
  },
  balanced: {
    label: 'Balanced CPU',
    description: '15 epochs · 640px · medium aug — good quality, shorter than Best',
    epochs: 15,
  },
};

export const DEFAULT_CPU_PRESET: CpuPreset = 'best_accuracy';

export function buildRetrainQuery(params: {
  epochs?: number;
  architecture?: string;
  preset?: CpuPreset;
}): string {
  const q = new URLSearchParams();
  if (params.epochs != null) q.set('epochs', String(params.epochs));
  if (params.architecture) q.set('architecture', params.architecture);
  q.set('preset', params.preset ?? DEFAULT_CPU_PRESET);
  return q.toString();
}
