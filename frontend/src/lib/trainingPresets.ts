export type CpuPreset = 'fast_cpu' | 'balanced';

export const CPU_PRESETS: Record<CpuPreset, { label: string; description: string; epochs: number }> = {
  fast_cpu: {
    label: 'Fast CPU',
    description: '10 epochs · 416px · light aug — recommended on CPU-only VPS',
    epochs: 10,
  },
  balanced: {
    label: 'Balanced CPU',
    description: '20 epochs · 640px · medium aug — slower, higher quality',
    epochs: 20,
  },
};

export const DEFAULT_CPU_PRESET: CpuPreset = 'fast_cpu';

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
