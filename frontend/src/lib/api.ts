const API_URL = import.meta.env.VITE_API_URL ?? '';

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

const DEFAULT_TIMEOUT_MS = 30_000;

class ApiClient {
  private token: string | null = localStorage.getItem('token');

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  private async request<T>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const url = API_URL ? `${API_URL}${path}` : path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out — API may be busy or unreachable. Try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail, res.statusText || 'Request failed'));
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }

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
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const url = API_URL ? `${API_URL}${path}` : path;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error('Failed to load image');
    return res.blob();
  }
}

export const api = new ApiClient();
export { API_URL, wsBaseUrl };
