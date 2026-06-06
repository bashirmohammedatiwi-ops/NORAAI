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
  epochElapsedSeconds?: number | null;
  epochEtaSeconds?: number | null;
  batchesPerMin?: number | null;
  batchesPerMinAvg?: number | null;
  secPerBatch?: number | null;
  imagesPerMin?: number | null;
  trainImages?: number | null;
  valImages?: number | null;
  exportedImages?: number | null;
  labeledTrainImages?: number | null;
  yoloTrainImages?: number | null;
  loss?: number | null;
  lossBox?: number | null;
  lossCls?: number | null;
  map50?: number | null;
  map50_95?: number | null;
  precision?: number | null;
}

export function computeEpochEtaSeconds(
  epochElapsedSeconds: number | null | undefined,
  epochProgress: number | null | undefined,
): number | null {
  if (!epochElapsedSeconds || epochElapsedSeconds <= 0 || !epochProgress || epochProgress <= 0 || epochProgress >= 100) {
    return null;
  }
  const total = epochElapsedSeconds / (epochProgress / 100);
  return Math.max(0, Math.round(total - epochElapsedSeconds));
}

export function computeJobEtaFromEpochPace(
  epochElapsedSeconds: number | null | undefined,
  epochProgress: number | null | undefined,
  currentEpoch: number,
  totalEpochs: number,
): number | null {
  if (
    !epochElapsedSeconds
    || epochElapsedSeconds <= 0
    || !epochProgress
    || epochProgress <= 0
    || totalEpochs <= 0
  ) {
    return null;
  }
  const epochTotalEst = epochElapsedSeconds / (epochProgress / 100);
  const remainingThisEpoch = Math.max(0, epochTotalEst - epochElapsedSeconds);
  const epochsAfterCurrent = Math.max(0, totalEpochs - currentEpoch);
  return Math.max(0, Math.round(remainingThisEpoch + epochsAfterCurrent * epochTotalEst));
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
