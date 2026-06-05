const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';
const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;
const AUTH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}?`));
}

function wsBaseUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

function formatApiError(detail: unknown, fallback = 'Request failed'): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    if ('msg' in detail) return String((detail as { msg: unknown }).msg);
    if ('message' in detail) return String((detail as { message: unknown }).message);
    return JSON.stringify(detail);
  }
  return fallback;
}

function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function readRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  setSession(accessToken: string, refreshToken?: string) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = readRefreshToken();
      if (!refreshToken) return false;

      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), 10_000);

      try {
        const url = API_URL ? `${API_URL}/api/v1/auth/refresh` : '/api/v1/auth/refresh';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal: timeoutController.signal,
        });
        if (!res.ok) return false;
        const data = await res.json() as { access_token: string; refresh_token: string };
        this.setSession(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private redirectToLogin() {
    this.clearToken();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    allowRefresh = true,
  ): Promise<T> {
    const token = readToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (token && !isAuthPath(path)) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const url = API_URL ? `${API_URL}${path}` : path;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    let signal = timeoutController.signal;
    if (options.signal) {
      if (options.signal.aborted) timeoutController.abort();
      options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers, signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (options.signal?.aborted) throw err;
        throw new Error('Request timed out — API may be busy or unreachable. Try again.');
      }
      if (err instanceof TypeError) {
        throw new Error(
          'تعذّر الاتصال بالخادم — تحقق أن الموقع يعمل (منفذ 8080) أو أن حجم الملف لا يتجاوز حد الرفع. أعد المحاولة بعد دقيقة.',
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && allowRefresh && !isAuthPath(path)) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        return this.request<T>(path, options, timeoutMs, false);
      }
      this.redirectToLogin();
      throw new Error('Session expired — please sign in again.');
    }

    if (res.status === 401) {
      this.redirectToLogin();
      throw new Error('Session expired — please sign in again.');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail, res.statusText || 'Request failed'));
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  get<T>(path: string, init?: RequestInit, timeoutMs?: number) {
    return this.request<T>(path, init, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  post<T>(path: string, body?: unknown, init?: RequestInit, timeoutMs?: number) {
    const isUpload = body instanceof FormData;
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: isUpload ? body : JSON.stringify(body),
    }, timeoutMs ?? (isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS));
  }

  /** Login without sending stale tokens or retrying refresh on 401. */
  login<T>(username: string, password: string) {
    return this.request<T>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      },
      20_000,
      false,
    );
  }

  patch<T>(path: string, body?: unknown, init?: RequestInit) {
    return this.request<T>(path, {
      ...init,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string, init?: RequestInit) {
    return this.request<T>(path, { ...init, method: 'DELETE' });
  }

  deleteWithBody<T>(path: string, body: { password: string }) {
    return this.request<T>(path, { method: 'DELETE', body: JSON.stringify(body) });
  }

  getDownloadUrl(path: string): string {
    return API_URL ? `${API_URL}${path}` : path;
  }

  imageContentPath(imageId: string): string {
    return `/api/v1/ingestion/images/${imageId}/content`;
  }

  async fetchBlob(path: string): Promise<Blob> {
    const token = readToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = API_URL ? `${API_URL}${path}` : path;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
      const refreshed = await this.refreshSession();
      if (refreshed) return this.fetchBlob(path);
      this.redirectToLogin();
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error('Failed to load image');
    return res.blob();
  }
}

export const api = new ApiClient();
export { API_URL, wsBaseUrl, readToken };
