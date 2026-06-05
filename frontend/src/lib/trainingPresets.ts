export type CpuPreset = 'fleet_cpu' | 'turbo_cpu' | 'fast_cpu' | 'balanced';

export const CPU_PRESETS: Record<CpuPreset, { label: string; description: string; epochs: number }> = {
  fleet_cpu: {
    label: 'Fleet Camera',
    description: '12 epochs · 416px — live road detection (recommended)',
    epochs: 12,
  },
  turbo_cpu: {
    label: 'Turbo CPU',
    description: '5 epochs · 320px · minimal aug — fastest test run',
    epochs: 5,
  },
  fast_cpu: {
    label: 'Fast CPU',
    description: '8 epochs · 416px · light aug — recommended on CPU VPS',
    epochs: 8,
  },
  balanced: {
    label: 'Balanced CPU',
    description: '15 epochs · 640px · medium aug — higher quality, slower',
    epochs: 15,
  },
};

export const DEFAULT_CPU_PRESET: CpuPreset = 'fleet_cpu';

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
