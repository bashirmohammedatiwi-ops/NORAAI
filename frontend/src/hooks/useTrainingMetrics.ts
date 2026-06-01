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
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setMetrics([]);
    const ws = new WebSocket(`${wsBaseUrl()}/api/v1/ws/training/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveTrainingUpdate;
        const hasUpdate = data.epoch != null || data.progress != null || data.phase || data.status;
        if (!hasUpdate) return;

        setMetrics((prev) => {
          if (data.save_epoch_metric && data.epoch != null) {
            const idx = prev.findIndex((m) => m.epoch === data.epoch && m.save_epoch_metric);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data };
              return next;
            }
          }
          if (data.phase === 'export' || data.phase === 'train' || data.phase === 'finalize') {
            const idx = prev.findIndex((m) => m.phase === data.phase && !m.save_epoch_metric);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data };
              return next;
            }
          }
          return [...prev, data];
        });
      } catch { /* ignore */ }
    };

    return () => ws.close();
  }, [jobId]);

  return { metrics, connected };
}
