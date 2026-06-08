import { useEffect, useRef, useState } from 'react';
import { wsBaseUrl } from '@/lib/api';

export interface LiveTrainingUpdate {
  epoch?: number;
  progress?: number;
  phase?: string;
  message?: string;
  batch?: number;
  total_batches?: number;
  status?: string;
  [key: string]: unknown;
}

export function useTrainingMetrics(jobId: string | null) {
  const [metrics, setMetrics] = useState<LiveTrainingUpdate[]>([]);
  const [epochMetrics, setEpochMetrics] = useState<LiveTrainingUpdate[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setMetrics([]);
    setEpochMetrics([]);
    const ws = new WebSocket(`${wsBaseUrl()}/api/v1/ws/training/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveTrainingUpdate;
        const hasUpdate = data.epoch != null || data.progress != null || data.phase || data.status;
        if (!hasUpdate) return;

        const isEpochAccuracy = Boolean(
          data.save_epoch_metric
          && data.epoch != null
          && !data.validation_skipped
          && (data.phase === 'validation' || data.map50_95 != null),
        );
        if (isEpochAccuracy) {
          setEpochMetrics((prev) => {
            const idx = prev.findIndex((m) => m.epoch === data.epoch);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data };
              return next;
            }
            return [...prev, data].sort((a, b) => (a.epoch ?? 0) - (b.epoch ?? 0));
          });
        }

        setMetrics((prev) => {
          if (isEpochAccuracy) {
            const idx = prev.findIndex((m) => m.epoch === data.epoch && m.save_epoch_metric);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data, _ts: Date.now() };
              return next;
            }
            return [...prev, { ...data, _ts: Date.now() }];
          }
          if (data.phase === 'train') {
            const stamped = { ...data, _ts: Date.now() };
            const next = [...prev, stamped];
            return next.length > 120 ? next.slice(-120) : next;
          }
          if (data.phase === 'export' || data.phase === 'finalize' || data.phase === 'setup') {
            const idx = prev.findIndex((m) => m.phase === data.phase && !m.save_epoch_metric);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data, _ts: Date.now() };
              return next;
            }
          }
          return [...prev, { ...data, _ts: Date.now() }];
        });
      } catch { /* ignore */ }
    };

    return () => ws.close();
  }, [jobId]);

  return { metrics, epochMetrics, connected };
}
