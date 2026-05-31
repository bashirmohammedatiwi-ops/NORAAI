import { useEffect, useRef, useState } from 'react';
import { wsBaseUrl } from '@/lib/api';

export function useTrainingMetrics(jobId: string | null) {
  const [metrics, setMetrics] = useState<Record<string, unknown>[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const ws = new WebSocket(`${wsBaseUrl()}/api/v1/ws/training/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.epoch) {
          setMetrics((prev) => {
            const idx = prev.findIndex((m) => m.epoch === data.epoch);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...data };
              return next;
            }
            return [...prev, data];
          });
        }
      } catch { /* ignore */ }
    };

    return () => ws.close();
  }, [jobId]);

  return { metrics, connected };
}
