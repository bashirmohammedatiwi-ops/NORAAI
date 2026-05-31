import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
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

  return { job, chartMetrics, connected, refresh };
}

function mergeMetrics(historical: TrainingMetricPoint[], live: TrainingMetricPoint[]): TrainingMetricPoint[] {
  const map = new Map<number, TrainingMetricPoint>();
  historical.forEach((m) => map.set(m.epoch, m));
  live.filter((m) => m.epoch).forEach((m) => map.set(m.epoch, { ...map.get(m.epoch), ...m }));
  return Array.from(map.values()).sort((a, b) => a.epoch - b.epoch);
}
