import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { computeEtaSeconds, type TrainingProgressDetail } from '@/lib/trainingProgress';
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

export function useTrainingJob(jobId: string | null) {
  const [job, setJob] = useState<TrainingJobDetail | null>(null);
  const [historicalMetrics, setHistoricalMetrics] = useState<TrainingMetricPoint[]>([]);
  const { metrics: liveMetrics, connected } = useTrainingMetrics(jobId);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const [detail, metrics] = await Promise.all([
      api.get<TrainingJobDetail>(`/api/v1/training/${jobId}`),
      api.get<TrainingMetricPoint[]>(`/api/v1/training/${jobId}/metrics`),
    ]);
    setJob(detail);
    setHistoricalMetrics(metrics);
  }, [jobId]);

  useEffect(() => {
    refresh();
    if (!jobId) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [jobId, refresh]);

  const chartMetrics = mergeMetrics(historicalMetrics, liveMetrics as unknown as TrainingMetricPoint[]);

  const liveJob = useMemo(() => {
    if (!job) return null;
    const latestLive = liveMetrics.length ? liveMetrics[liveMetrics.length - 1] : null;
    const hasLive = latestLive && (
      latestLive.progress != null
      || latestLive.epoch != null
      || latestLive.phase
      || latestLive.message
    );
    if (!hasLive) return job;

    const epoch = Number(latestLive.epoch ?? job.current_epoch);
    const total = Number(latestLive.total_epochs ?? job.total_epochs) || job.total_epochs;
    const progress = Number(latestLive.progress ?? job.progress);
    const duration = job.duration_seconds;

    return {
      ...job,
      current_epoch: epoch,
      total_epochs: total,
      progress: Math.min(100, Math.max(0, progress)),
      phase: (latestLive.phase as string | undefined) ?? job.phase,
      message: (latestLive.message as string | undefined) ?? job.message,
      batch: num(latestLive.batch, job.batch),
      total_batches: num(latestLive.total_batches, job.total_batches),
      epoch_progress: num(latestLive.epoch_progress, job.epoch_progress),
      export_current: num(latestLive.export_current, job.export_current),
      export_total: num(latestLive.export_total, job.export_total),
      current_step: num(latestLive.current_step, job.current_step),
      total_steps: num(latestLive.total_steps, job.total_steps),
      eta_seconds: num(latestLive.eta_seconds, job.eta_seconds) ?? computeEtaSeconds(duration, progress),
      latest_metrics: {
        loss: num(latestLive.loss, job.latest_metrics?.loss),
        precision: num(latestLive.precision, job.latest_metrics?.precision),
        recall: num(latestLive.recall, job.latest_metrics?.recall),
        f1: num(latestLive.f1, job.latest_metrics?.f1),
        map50: num(latestLive.map50, job.latest_metrics?.map50),
        map50_95: num(latestLive.map50_95, job.latest_metrics?.map50_95),
      },
    };
  }, [job, liveMetrics]);

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
