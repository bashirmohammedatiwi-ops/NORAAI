export type CpuPreset =
  | 'fine_tune'
  | 'best_accuracy'
  | 'max_cpu'
  | 'fleet_cpu'
  | 'turbo_cpu'
  | 'fast_cpu'
  | 'balanced';

export const CPU_PRESETS: Record<CpuPreset, { label: string; description: string; epochs: number }> = {
  fine_tune: {
    label: 'Fine-tune Main Model',
    description: '30 epochs · 640px · low LR — continues from active model (best mAP gain)',
    epochs: 30,
  },
  best_accuracy: {
    label: 'Best Accuracy',
    description: '20 epochs · 640px · medium aug — first training from pretrained base',
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

export const DEFAULT_CPU_PRESET: CpuPreset = 'fine_tune';

export function buildRetrainQuery(params: {
  epochs?: number;
  architecture?: string;
  preset?: CpuPreset;
  fineTune?: boolean;
}): string {
  const q = new URLSearchParams();
  if (params.epochs != null) q.set('epochs', String(params.epochs));
  if (params.architecture) q.set('architecture', params.architecture);
  q.set('preset', params.preset ?? DEFAULT_CPU_PRESET);
  q.set('fine_tune', String(params.fineTune ?? true));
  return q.toString();
}
