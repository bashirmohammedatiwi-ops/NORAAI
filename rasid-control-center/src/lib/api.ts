const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'rasid_cc_token';
const REFRESH_KEY = 'rasid_cc_refresh';
const PROJECT_KEY = 'rasid_cc_project';

function wsBaseUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

function formatError(detail: unknown, fallback = 'فشل الطلب'): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join('؛ ');
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  return fallback;
}

class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  setSession(access: string, refresh?: string) {
    localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  clearProjectId() {
    localStorage.removeItem(PROJECT_KEY);
  }

  getProjectId(): string | null {
    return localStorage.getItem(PROJECT_KEY);
  }

  setProjectId(id: string) {
    localStorage.setItem(PROJECT_KEY, id);
  }

  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const refresh = localStorage.getItem(REFRESH_KEY);
      if (!refresh) return false;
      try {
        const url = API_URL ? `${API_URL}/api/v1/auth/refresh` : '/api/v1/auth/refresh';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refresh }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) return false;
        const data = await res.json() as { access_token: string; refresh_token: string };
        this.setSession(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private async request<T>(path: string, options: RequestInit = {}, allowRefresh = true, timeoutMs = 20000): Promise<T> {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const url = API_URL ? `${API_URL}${path}` : path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال — تحقق أن الخادم يعمل');
      }
      throw new Error('تعذّر الاتصال بالخادم');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && allowRefresh) {
      const ok = await this.refreshSession();
      if (ok) return this.request<T>(path, options, false);
      this.clearSession();
      throw new Error('انتهت الجلسة — سجّل الدخول مجدداً');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const msg = formatError(err.detail, res.statusText);
      if (res.status === 502 || res.status === 503) {
        throw new Error('الخادم غير جاهز — انتظر دقيقة ثم أعد المحاولة (502)');
      }
      throw new Error(msg);
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }

  postForm<T>(path: string, form: FormData) {
    return this.request<T>(path, { method: 'POST', body: form });
  }

  wsUrl(path: string) {
    return `${wsBaseUrl()}${path}`;
  }
}

export const api = new ApiClient();
