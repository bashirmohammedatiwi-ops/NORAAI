import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RoadAlert } from '@/types';

interface RoadWebSocketOptions {
  onAlert?: (alert: RoadAlert) => void;
  onStatus?: (connected: boolean) => void;
}

const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 30_000;
const INVALIDATE_DEBOUNCE_MS = 750;

export function useRoadWebSocket(projectId: string | null, opts?: RoadWebSocketOptions) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAlertRef = useRef(opts?.onAlert);
  const onStatusRef = useRef(opts?.onStatus);
  const [connected, setConnected] = useState(false);
  onAlertRef.current = opts?.onAlert;
  onStatusRef.current = opts?.onStatus;

  useEffect(() => {
    onStatusRef.current?.(connected);
  }, [connected]);

  useEffect(() => {
    if (!projectId) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    function setLive(value: boolean) {
      if (!cancelled) setConnected(value);
    }

    function scheduleInvalidate() {
      if (invalidateTimerRef.current) return;
      invalidateTimerRef.current = setTimeout(() => {
        invalidateTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ['alerts', projectId] });
        qc.invalidateQueries({ queryKey: ['overview', projectId] });
        qc.invalidateQueries({ queryKey: ['notifications', projectId] });
        qc.invalidateQueries({ queryKey: ['roadStats', projectId] });
      }, INVALIDATE_DEBOUNCE_MS);
    }

    function connect() {
      if (cancelled) return;
      setLive(false);
      const url = api.wsUrl(`/api/v1/ws/road-intelligence/${projectId}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setLive(true);
      };

      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as RoadAlert & { action?: string };
          scheduleInvalidate();
          if (payload.action === 'resolved') {
            qc.setQueryData<RoadAlert[]>(['alerts', projectId, { activeOnly: true }], (old) =>
              old?.filter((a) => a.id !== payload.id) ?? old,
            );
          } else if (payload.action === 'created' || payload.is_active) {
            onAlertRef.current?.(payload);
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setLive(false);
        if (cancelled) return;
        const delay = Math.min(BASE_DELAY_MS * 2 ** retryRef.current, MAX_DELAY_MS);
        retryRef.current += 1;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [projectId, qc]);

  return connected;
}
