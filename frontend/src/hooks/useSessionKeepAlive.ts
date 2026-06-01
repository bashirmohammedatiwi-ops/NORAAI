import { useEffect } from 'react';
import { api, readToken } from '@/lib/api';

/** Silently refresh JWT before the 60-minute access token expires. */
export function useSessionKeepAlive() {
  useEffect(() => {
    const tick = () => {
      if (!readToken()) return;
      api.refreshSession().catch(() => {});
    };

    tick();
    const id = window.setInterval(tick, 45 * 60_000);
    return () => window.clearInterval(id);
  }, []);
}
