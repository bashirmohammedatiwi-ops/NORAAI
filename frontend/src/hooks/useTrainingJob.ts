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
  epoch_elapsed_seconds?: number | null;
  epoch_eta_seconds?: number | null;
  batches_per_min?: number | null;
  batches_per_min_avg?: number | null;
  sec_per_batch?: number | null;
  images_per_min?: number | null;
  train_images?: number | null;
  val_images?: number | null;
  exported_images?: number | null;
  labeled_train_images?: number | null;
  yolo_train_images?: number | null;
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

  const latestTrainLive = useMemo(() => {
    for (let i = liveMetrics.length - 1; i >= 0; i -= 1) {
      if (liveMetrics[i].phase === 'train') return liveMetrics[i];
    }
    return null;
  }, [liveMetrics]);

  const liveJob = useMemo(() => {
    const base = job ?? (baseline && jobId ? ({ ...baseline, id: jobId } as TrainingJobDetail) : null);
    if (!base) return null;
    const latestLive = liveMetrics.length ? liveMetrics[liveMetrics.length - 1] : null;
    const speedLive = latestTrainLive ?? latestLive;
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
      batch: isValidation ? num(speedLive?.batch, base.batch) : num(speedLive?.batch, base.batch),
      total_batches: isValidation ? num(speedLive?.total_batches, base.total_batches) : num(speedLive?.total_batches, base.total_batches),
      epoch_progress: isValidation ? num(speedLive?.epoch_progress, base.epoch_progress) : num(speedLive?.epoch_progress, base.epoch_progress),
      export_current: num(latestLive.export_current, base.export_current),
      export_total: num(latestLive.export_total, base.export_total),
      current_step: num(speedLive?.current_step, base.current_step),
      total_steps: num(speedLive?.total_steps, base.total_steps),
      eta_seconds: num(speedLive?.eta_seconds, base.eta_seconds) ?? computeEtaSeconds(duration, progress),
      epoch_elapsed_seconds: num(speedLive?.epoch_elapsed_seconds, base.epoch_elapsed_seconds),
      epoch_eta_seconds: num(speedLive?.epoch_eta_seconds, base.epoch_eta_seconds),
      batches_per_min: num(speedLive?.batches_per_min, base.batches_per_min),
      batches_per_min_avg: num(speedLive?.batches_per_min_avg, base.batches_per_min_avg),
      sec_per_batch: num(speedLive?.sec_per_batch, base.sec_per_batch),
      images_per_min: num(speedLive?.images_per_min, base.images_per_min),
      train_images: num(latestLive.train_images, base.train_images),
      val_images: num(latestLive.val_images, base.val_images),
      exported_images: num(latestLive.exported_images, base.exported_images),
      labeled_train_images: num(latestLive.labeled_train_images, base.labeled_train_images),
      yolo_train_images: num(latestLive.yolo_train_images, base.yolo_train_images),
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
  }, [job, baseline, jobId, liveMetrics, latestTrainLive]);

  const progressDetail: TrainingProgressDetail | undefined = useMemo(() => {
    if (!liveJob) return undefined;
    const latestLive = latestTrainLive ?? (liveMetrics.length ? liveMetrics[liveMetrics.length - 1] : null);
    return {
      epochProgress: liveJob.epoch_progress,
      exportCurrent: liveJob.export_current,
      exportTotal: liveJob.export_total,
      currentStep: liveJob.current_step,
      totalSteps: liveJob.total_steps,
      etaSeconds: liveJob.eta_seconds,
      epochElapsedSeconds: liveJob.epoch_elapsed_seconds,
      epochEtaSeconds: liveJob.epoch_eta_seconds,
      batchesPerMin: liveJob.batches_per_min,
      batchesPerMinAvg: liveJob.batches_per_min_avg,
      secPerBatch: liveJob.sec_per_batch,
      imagesPerMin: liveJob.images_per_min,
      trainImages: liveJob.train_images,
      valImages: liveJob.val_images,
      exportedImages: liveJob.exported_images,
      labeledTrainImages: liveJob.labeled_train_images,
      yoloTrainImages: liveJob.yolo_train_images,
      loss: liveJob.latest_metrics?.loss,
      lossBox: num(latestLive?.loss_box, null),
      lossCls: num(latestLive?.loss_cls, null),
      map50: liveJob.latest_metrics?.map50,
      map50_95: liveJob.latest_metrics?.map50_95,
      precision: liveJob.latest_metrics?.precision,
    };
  }, [liveJob, liveMetrics, latestTrainLive]);

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
