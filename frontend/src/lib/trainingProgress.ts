export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function computeEtaSeconds(durationSeconds: number | null | undefined, progress: number): number | null {
  if (!durationSeconds || durationSeconds <= 0 || progress <= 0 || progress >= 100) return null;
  const total = durationSeconds / (progress / 100);
  return Math.max(0, Math.round(total - durationSeconds));
}

export interface TrainingProgressDetail {
  epochProgress?: number | null;
  exportCurrent?: number | null;
  exportTotal?: number | null;
  currentStep?: number | null;
  totalSteps?: number | null;
  etaSeconds?: number | null;
  loss?: number | null;
  lossBox?: number | null;
  lossCls?: number | null;
  map50?: number | null;
  map50_95?: number | null;
  precision?: number | null;
}

export const TRAINING_PHASES = [
  { id: 'export', label: 'Export dataset', range: [0, 15] as const },
  { id: 'train', label: 'Train model', range: [15, 99] as const },
  { id: 'finalize', label: 'Save model', range: [99, 100] as const },
] as const;

export function phaseIndex(phase?: string | null): number {
  if (phase === 'export') return 0;
  if (phase === 'train') return 1;
  if (phase === 'finalize') return 2;
  return -1;
}
