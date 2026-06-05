import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { computeEtaSeconds, type TrainingProgressDetail } from '@/lib/trainingProgress';
import type { TrainingMetricsMeta } from '@/lib/trainingMetrics';
import { useTrainingMetrics } from './useTrainingMetrics';

export interface TrainingJobDetail {
  id: string;
  name: string;
  architecture: string;
  training_mode: string;
  status: string;
  hpo_enabled: boolean;
  config: Record<string, unknown>;
  progress: number;
  current_epoch: number;
  total_epochs: number;
  duration_seconds: number | null;
  error_message: string | null;
  device?: string;
  phase?: string | null;
  message?: string | null;
  batch?: number | null;
  total_batches?: number | null;
  epoch_progress?: number | null;
  export_current?: number | null;
  export_total?: number | null;
  current_step?: number | null;
  total_steps?: number | null;
  eta_seconds?: number | null;
  latest_metrics: {
    loss: number | null;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    map50: number | null;
    map50_95: number | null;
  } | null;
  metrics_meta?: TrainingMetricsMeta | null;
  artifact: {
    id: string;
    name: string;
    metrics: Record<string, number>;
    model_size_mb: number;
    lifecycle: string;
  } | null;
}

export interface TrainingMetricPoint {
  epoch: number;
  loss?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  map50?: number;
  map50_95?: number;
  progress?: number;
  [key: string]: unknown;
}

export function useTrainingJob(
  jobId: string | null,
  options?: { pollRest?: boolean; baseline?: Partial<TrainingJobDetail> },
) {
  const pollRest = options?.pollRest ?? true;
  const baseline = options?.baseline;
  const [job, setJob] = useState<TrainingJobDetail | null>(
    baseline && jobId ? ({ ...baseline, id: jobId } as TrainingJobDetail) : null,
  );
  const [historicalMetrics, setHistoricalMetrics] = useState<TrainingMetricPoint[]>([]);
  const { metrics: liveMetrics, connected } = useTrainingMetrics(jobId);

  const refresh = useCallback(async () => {
    if (!jobId || !pollRest) return;
    const [detail, metrics] = await Promise.all([
      api.get<TrainingJobDetail>(`/api/v1/training/${jobId}`, undefined, 45_000),
      api.get<TrainingMetricPoint[]>(`/api/v1/training/${jobId}/metrics`, undefined, 45_000),
    ]);
    setJob(detail);
    setHistoricalMetrics(metrics);
  }, [jobId, pollRest]);

  useEffect(() => {
    if (!pollRest || !jobId) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [jobId, refresh, pollRest]);

  const chartMetrics = mergeMetrics(historicalMetrics, liveMetrics as unknown as TrainingMetricPoint[]);

  const liveJob = useMemo(() => {
    const base = job ?? (baseline && jobId ? ({ ...baseline, id: jobId } as TrainingJobDetail) : null);
    if (!base) return null;
    const latestLive = liveMetrics.length ? liveMetrics[liveMetrics.length - 1] : null;
    const terminal = ['completed', 'failed', 'cancelled'].includes(base.status);
    const hasLive = !terminal && latestLive && (
      latestLive.progress != null
      || latestLive.epoch != null
      || latestLive.phase
      || latestLive.message
    );
    if (!hasLive) return base;

    const epoch = Number(latestLive.epoch ?? base.current_epoch);
    const total = Number(latestLive.total_epochs ?? base.total_epochs) || base.total_epochs;
    const progress = Number(latestLive.progress ?? base.progress);
    const duration = base.duration_seconds;
    const validationLive = latestLive.phase === 'validation' || latestLive.save_epoch_metric
      ? latestLive
      : null;

    const isValidation = latestLive.phase === 'validation';
    return {
      ...base,
      current_epoch: epoch,
      total_epochs: total,
      progress: Math.min(100, Math.max(0, progress)),
      phase: (latestLive.phase as string | undefined) ?? base.phase,
      message: (latestLive.message as string | undefined) ?? base.message,
      batch: isValidation ? base.batch : num(latestLive.batch, base.batch),
      total_batches: isValidation ? base.total_batches : num(latestLive.total_batches, base.total_batches),
      epoch_progress: isValidation ? 100 : num(latestLive.epoch_progress, base.epoch_progress),
      export_current: num(latestLive.export_current, base.export_current),
      export_total: num(latestLive.export_total, base.export_total),
      current_step: num(latestLive.current_step, base.current_step),
      total_steps: num(latestLive.total_steps, base.total_steps),
      eta_seconds: num(latestLive.eta_seconds, base.eta_seconds) ?? computeEtaSeconds(duration, progress),
      latest_metrics: validationLive
        ? {
            loss: num(validationLive.loss, base.latest_metrics?.loss),
            precision: num(validationLive.precision, base.latest_metrics?.precision),
            recall: num(validationLive.recall, base.latest_metrics?.recall),
            f1: num(validationLive.f1, base.latest_metrics?.f1),
            map50: num(validationLive.map50, base.latest_metrics?.map50),
            map50_95: num(validationLive.map50_95, base.latest_metrics?.map50_95),
          }
        : base.latest_metrics,
    };
  }, [job, baseline, jobId, liveMetrics]);

  const progressDetail: TrainingProgressDetail | undefined = useMemo(() => {
    if (!liveJob) return undefined;
    const latestLive = liveMetrics.length ? liveMetrics[liveMetrics.length - 1] : null;
    return {
      epochProgress: liveJob.epoch_progress,
      exportCurrent: liveJob.export_current,
      exportTotal: liveJob.export_total,
      currentStep: liveJob.current_step,
      totalSteps: liveJob.total_steps,
      etaSeconds: liveJob.eta_seconds,
      loss: liveJob.latest_metrics?.loss,
      lossBox: num(latestLive?.loss_box, null),
      lossCls: num(latestLive?.loss_cls, null),
      map50: liveJob.latest_metrics?.map50,
      map50_95: liveJob.latest_metrics?.map50_95,
      precision: liveJob.latest_metrics?.precision,
    };
  }, [liveJob, liveMetrics]);

  const activityLog = useMemo(
    () => liveMetrics
      .filter((m) => m.message)
      .slice(-6)
      .reverse()
      .map((m) => ({
        message: String(m.message),
        phase: m.phase as string | undefined,
        progress: m.progress as number | undefined,
      })),
    [liveMetrics],
  );

  return { job: liveJob, chartMetrics, connected, refresh, progressDetail, activityLog };
}

function num(value: unknown, fallback: number | null | undefined): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return fallback ?? null;
}

function mergeMetrics(historical: TrainingMetricPoint[], live: TrainingMetricPoint[]): TrainingMetricPoint[] {
  const map = new Map<number, TrainingMetricPoint>();
  historical.forEach((m) => map.set(m.epoch, m));
  live
    .filter((m) => m.save_epoch_metric && m.epoch)
    .forEach((m) => map.set(m.epoch, { ...map.get(m.epoch), ...m }));
  return Array.from(map.values()).sort((a, b) => a.epoch - b.epoch);
}
